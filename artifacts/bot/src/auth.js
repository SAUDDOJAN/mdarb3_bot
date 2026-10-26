import { query, getActiveBroadcastAlerts, saveAppSession, getAppSession, deleteAppSession } from './database/index.js';
import { getActiveAion2Application, updatePlayerProfileFromShugo } from './modules/aion2Lfg/db/player.js';
import { scrapeProfile } from './modules/scraper.js';
import { updateEventsCard } from './modules/aion2Lfg/eventsCard.js';
import { coreCreateGroup, coreJoinGroup, coreLeaveGroup, coreCloseGroup } from './modules/aion2Lfg/handlers/recruitment.js';
import { coreStartCompletionVote, coreRequestFallbackVote, coreConfirmFallbackVote, coreSubmitCompletionVote } from './modules/aion2Lfg/handlers/voting.js';
import { coreStartVoice } from './modules/aion2Lfg/handlers/voice.js';
import { processPendingLedgers } from './modules/aion2Lfg/workers/ledgerWorker.js';
import { b4EvaluatorHook } from './modules/aion2Lfg/evaluator/b4Evaluator.js';
import { getGuildStatsData } from './modules/aion2GuildStats.js';
import { ACTIVITY_CONFIG } from './modules/aion2Lfg/utils/activitiesConfig.js';
import { getCapacity } from './modules/aion2Lfg/utils/solvers.js';
import { getCurrentMonthlyCycle } from './modules/aion2Lfg/utils/timeCycles.js';
import { getMonthlyRankings } from './modules/aion2Lfg/leaderboard/ranking.js';
import { enqueueProfileSync, enqueueMissingCpMembers } from './modules/shugoSyncQueue.js';
// from './modules/aion2GuildStats.js';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// In-memory cache + Postgres persistence for perpetual logins.
export function createAuthHandler({ client, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const attempts = new Map(), sessions = new Map(), limits = new Map();
  const profileSyncCooldowns = new Map(), activeProfileSyncs = new Set();
  const SYNC_COOLDOWN_MS = 60_000;
  const TARGET_CHAT_CHANNEL = "1548357027758219378";
  let chatHistoryCache = null;
  let chatCacheExpires = 0;
  let chatFetchPromise = null;

  async function getChatHistory() {
    if (chatHistoryCache && now() < chatCacheExpires) {
      return chatHistoryCache;
    }
    if (chatFetchPromise) {
      return await chatFetchPromise;
    }
    chatFetchPromise = (async () => {
      try {
        const channel = await client.channels.fetch(TARGET_CHAT_CHANNEL);
        if (!channel) throw new Error("CHANNEL_NOT_FOUND");
        const msgs = await channel.messages.fetch({ limit: 50 });
        const history = [...msgs.values()].map(msg => {
          let text = msg.content || '';
          if (text.includes('<@') && channel.guild) {
            text = text.replace(/<@!?(\d+)>/g, (m, id) => {
              const mem = channel.guild.members.cache.get(id);
              return mem ? `@${mem.displayName}` : m;
            });
          }
          return {
            id: msg.id,
            message_id: msg.id,
            content: text,
            raw_content: msg.content,
            author_id: msg.author?.id || null,
            author_display_name: msg.member?.displayName || msg.author.displayName || msg.author.username,
            author_avatar: msg.member?.displayAvatarURL() || msg.author.displayAvatarURL() || null,
            attachments: [...msg.attachments.values()].map(a => ({
              url: a.url,
              name: a.name,
              contentType: a.contentType || ''
            })),
            created_at: msg.createdTimestamp
          };
        }).reverse();
        chatHistoryCache = history;
        chatCacheExpires = now() + 5000;
        return history;
      } catch (err) {
        console.error("Chat fetch error:", err);
        return [];
      } finally {
        chatFetchPromise = null;
      }
    })();
    return await chatFetchPromise;
  }
  const guildId = '861355983975874601';
  const ROLE_M3RGEEN_GLOBAL = '1555617080521269368';
  const ROLE_EMPEROR = '1555617021411065917';
  const inviteUrl = 'https://discord.gg/ZswDdA7KXr';
  const origins = new Set((env.AION_AUTH_ORIGINS || 'http://127.0.0.1:4177').split(',').map(x => x.trim()));
  const lifetime = 30 * 24 * 60 * 60 * 1000; // 30-day persistent session
  const random = () => randomBytes(32).toString('base64url');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const send = (res, status, body) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body));};
  async function body(req) {
    let value = ''; for await (const chunk of req) { value += chunk; if (value.length > 4096) throw new Error('INVALID_BODY'); }
    try { return JSON.parse(value); } catch { throw new Error('INVALID_BODY'); }
  }

  function checkAccessEligibility(member, aion2Profile) {
    if (!member) {
      return {
        allowed: false,
        reason: 'NOT_A_GUILD_MEMBER',
        message: 'حسابك ليس عضواً في سيرفر ديسكورد الرسمي لمجتمع M3RGEEN.'
      };
    }

    const memberRoleIds = new Set(member.roles.cache.keys());
    const hasGlobalRole = memberRoleIds.has(ROLE_M3RGEEN_GLOBAL);
    const hasEmperorRole = memberRoleIds.has(ROLE_EMPEROR);

    // Resolve assigned / active guild gracefully
    let effectiveGuild = 'M3RGEEN_GLOBAL';
    if (hasEmperorRole || (aion2Profile && aion2Profile.assigned_guild === 'EMPEROR')) {
      effectiveGuild = 'EMPEROR';
    } else if (aion2Profile && aion2Profile.assigned_guild) {
      effectiveGuild = aion2Profile.assigned_guild;
    }

    // All members in M3RGEEN Discord server are welcomed into the application
    return {
      allowed: true,
      effectiveGuild,
      reason: 'AUTHORIZED',
      message: 'تم التحقق من العضوية بنجاح.'
    };
  }

  async function profile(id) {
    if (!client.isReady()) throw new Error('SERVICE_UNAVAILABLE');
    const guild = await client.guilds.fetch(guildId);
    let member;
    try { member = await guild.members.fetch({user:id,force:true}); }
    catch (error) { if (Number(error.code) === 10007) return null; throw error; }
    
    let aion2Profile = null;
    try {
      const res = await query(
        `SELECT character_name, selected_class, character_level, combat_power, profile_image, shugo_url, race_name, server_name, status, transition_status, guild_type, assigned_guild, guild_app_status, guild_app_target, character_data, character_data->>'itemLevel' as item_level 
         FROM aion2_global_applications 
         WHERE discord_id = $1 ORDER BY id DESC LIMIT 1`, 
        [id]
      );
      if (res.rows.length > 0) {
        aion2Profile = res.rows[0];
        if (aion2Profile.item_level) {
          aion2Profile.item_level = parseInt(aion2Profile.item_level, 10) || null;
        }
      }
    } catch (e) {
      console.error('[Auth] Failed to fetch AION2 profile:', e);
    }

    const access = checkAccessEligibility(member, aion2Profile);

    return {id:member.user.id, username:member.user.username, displayName:member.displayName,
      avatar:member.user.displayAvatarURL({size:128}),
      roles:[...member.roles.cache.values()].filter(r=>r.id !== guildId).map(r=>({id:r.id,name:r.name,color:r.hexColor})),
      aion2Profile,
      access};
  }
  async function discord(url, options) {
    const response = await fetchImpl(url, {...options,signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('DISCORD_UNAVAILABLE');
    return response.json();
  }
  return async function handleAuth(req,res,url) {
    if (!url.pathname.startsWith('/api/auth/')) return false;
    res.removeHeader('Access-Control-Allow-Origin');
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Content-Type-Options','nosniff');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {send(res,403,{error:'ORIGIN_NOT_ALLOWED'});return true;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true;}
    for(const [id,a] of attempts) if(a.expires <= now()) attempts.delete(id);
    for(const [id,s] of sessions) if(s.expires <= now()) sessions.delete(id);
    for(const [id,l] of limits) if(l.expires <= now()) limits.delete(id);
    try {
      if(url.pathname === '/api/auth/login' && req.method==='POST') {
        if(!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI){send(res,503,{error:'AUTH_NOT_CONFIGURED'});return true;}
        if(!env.DISCORD_REDIRECT_URI.startsWith('https://')) throw new Error('SERVICE_UNAVAILABLE');
        const ip=req.socket.remoteAddress || 'unknown';const limit=limits.get(ip)||{count:0,expires:now()+60000};
        if(++limit.count>20){send(res,429,{error:'TOO_MANY_ATTEMPTS'});return true;}limits.set(ip,limit);
        const input=await body(req);if(!/^[a-f0-9]{64}$/.test(input.challenge || '')) throw new Error('INVALID_BODY');
        if(attempts.size>=1000)throw new Error('SERVICE_UNAVAILABLE');
        const state=random();attempts.set(state,{challenge:input.challenge,expires:now()+300000,used:false,result:null});
        const authorize=new URL('https://discord.com/oauth2/authorize');
        authorize.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,redirect_uri:env.DISCORD_REDIRECT_URI,response_type:'code',scope:'identify',state}).toString();
        send(res,200,{attempt:state,authorizeUrl:authorize.href});return true;
      }
      if(url.pathname==='/api/auth/callback' && req.method==='GET') {
        const state=url.searchParams.get('state'),a=attempts.get(state);
        if(!a || a.used){send(res,400,{error:'INVALID_OR_EXPIRED_STATE'});return true;}
        a.used=true;
        try {
          if(url.searchParams.has('error')){a.result={error:'LOGIN_CANCELLED'};}
          else {
            const code=url.searchParams.get('code');if(!code)throw new Error('INVALID_BODY');
            const token=await discord('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:env.DISCORD_REDIRECT_URI})});
            try {const user=await discord('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});const member=await profile(user.id);a.result=member?{user:member}:{error:'NOT_A_GUILD_MEMBER',inviteUrl};}
            finally {await fetchImpl('https://discord.com/api/oauth2/token/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,token:token.access_token}),signal:AbortSignal.timeout(10000)}).catch(()=>{});}
          }
        } catch {a.result={error:'SERVICE_UNAVAILABLE'};}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
        res.end('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>M3RGEEN</title><body style="background:#0b0e14;color:#edf0f6;font:20px Tahoma;text-align:center;padding:80px"><h1>M3RGEEN</h1><p>تمت معالجة طلب الدخول. ارجع إلى البرنامج لعرض النتيجة.</p></body></html>');return true;
      }
      if(url.pathname==='/api/auth/exchange' && req.method==='POST') {
        const input=await body(req),a=attempts.get(input.attempt);
        if(typeof input.verifier !== 'string' || input.verifier.length!==64 || !a || !timingSafeEqual(Buffer.from(digest(input.verifier)),Buffer.from(a.challenge))){send(res,400,{error:'INVALID_OR_EXPIRED_ATTEMPT'});return true;}
        if(!a.result){send(res,202,{pending:true});return true;}
        attempts.delete(input.attempt);
        if(a.result.error){send(res,a.result.error==='NOT_A_GUILD_MEMBER'?403:400,a.result);return true;}
        
        // Access verification check on exchange
        if(a.result.user && a.result.user.access && !a.result.user.access.allowed) {
          send(res, 403, {
            error: 'ACCESS_DENIED',
            reason: a.result.user.access.reason,
            message: a.result.user.access.message,
            inviteUrl,
            user: a.result.user
          });
          return true;
        }

        const token=random();
        const tokenHash = digest(token);
        const expiresAt = new Date(now() + lifetime);
        sessions.set(tokenHash,{
          id: a.result.user.id,
          expires: now()+lifetime,
          access: a.result.user.access,
          lastCheck: now()
        });
        await saveAppSession(tokenHash, a.result.user.id, expiresAt);
        send(res,200,{success:true,token,expiresAt:now()+lifetime,user:a.result.user});return true;
      }
      if((url.pathname==='/api/auth/aion2-broadcasts' || url.pathname==='/api/aion2-broadcasts') && req.method==='GET'){
        let broadcasts = [];
        try {
          broadcasts = await getActiveBroadcastAlerts(10);
        } catch (e) {
          console.error('[Broadcasts] Error querying active broadcasts:', e);
        }
        send(res, 200, { success: true, broadcasts });
        return true;
      }
      if(['/api/auth/me','/api/auth/logout','/api/auth/aion2-guilds','/api/auth/aion2-leaderboard','/api/auth/aion2-lfg','/api/auth/aion2-lfg/create','/api/auth/aion2-lfg/join','/api/auth/aion2-lfg/leave','/api/auth/aion2-lfg/close','/api/auth/aion2-lfg/start-voice','/api/auth/aion2-lfg/vote','/api/auth/aion2-notifications','/api/auth/aion2-chat','/api/auth/aion2-profile/sync'].includes(url.pathname)) {
        const key=digest((req.headers.authorization || '').replace(/^Bearer /,''));
        let session=sessions.get(key);
        if(!session){
          const dbSession = await getAppSession(key);
          if (dbSession) {
            session = {
              id: dbSession.discord_id,
              expires: new Date(dbSession.expires_at).getTime(),
              access: null,
              lastCheck: 0
            };
            sessions.set(key, session);
          }
        }
        if(!session || session.expires <= now()){
          if(session){
            sessions.delete(key);
            await deleteAppSession(key);
          }
          send(res,401,{error:'SESSION_EXPIRED'});
          return true;
        }
        if(url.pathname==='/api/auth/logout' && req.method==='POST'){
          sessions.delete(key);
          await deleteAppSession(key);
          send(res,200,{success:true});
          return true;
        }
        if(url.pathname==='/api/auth/me' && req.method==='GET'){
          const user=await profile(session.id);
          if(!user){
            sessions.delete(key);
            await deleteAppSession(key);
            send(res,403,{error:'NOT_A_GUILD_MEMBER',inviteUrl});
            return true;
          }
          if(!user.access || !user.access.allowed){
            send(res,403,{
              error:'ACCESS_DENIED',
              reason: user.access.reason,
              message: user.access.message,
              inviteUrl,
              user
            });
            return true;
          }
          session.access = user.access;
          session.lastCheck = now();
          try { enqueueProfileSync(session.id); } catch(e) {}
          send(res,200,{success:true,user,expiresAt:session.expires});
          return true;
        }

        // Enforce membership & role re-verification on protected app routes
        const protectedAppRoutes = [
          '/api/auth/aion2-guilds',
          '/api/auth/aion2-leaderboard',
          '/api/auth/aion2-lfg',
          '/api/auth/aion2-lfg/create',
          '/api/auth/aion2-lfg/join',
          '/api/auth/aion2-lfg/leave',
          '/api/auth/aion2-lfg/close',
          '/api/auth/aion2-lfg/start-voice',
          '/api/auth/aion2-lfg/vote',
          '/api/auth/aion2-notifications',
          '/api/auth/aion2-chat',
          '/api/auth/aion2-profile/sync'
        ];
        if (protectedAppRoutes.includes(url.pathname)) {
          if (now() - (session.lastCheck || 0) > 60_000) {
            const freshUser = await profile(session.id);
            if (!freshUser) {
              sessions.delete(key);
              send(res, 403, { error: 'NOT_A_GUILD_MEMBER', inviteUrl });
              return true;
            }
            session.access = freshUser.access;
            session.lastCheck = now();
          }
          if (!session.access || !session.access.allowed) {
            send(res, 403, {
              error: 'ACCESS_DENIED',
              reason: session.access?.reason || 'NOT_QUALIFIED',
              message: session.access?.message || 'غير مصرح بالوصول إلى هذا القسم لعدم استيفاء شروط العضوية.'
            });
            return true;
          }
        }
        if(url.pathname==='/api/auth/aion2-leaderboard' && req.method==='GET'){
          const { cycleId } = getCurrentMonthlyCycle();
          const rankings = await getMonthlyRankings(cycleId);
          
          let myRank = rankings.find(r => r.discord_id === session.id);
          const me = {
            rank: myRank ? myRank.rank : null,
            total_points: myRank ? myRank.total_points : 0
          };

          const top5 = rankings.slice(0, 5);
          const top5Ids = top5.map(r => r.discord_id);
          
          let idToProfile = {};
          if (top5Ids.length > 0) {
            const appsRes = await query(`
              SELECT DISTINCT ON (discord_id) discord_id, character_name, profile_image 
              FROM aion2_global_applications 
              WHERE discord_id = ANY($1::text[]) AND LOWER(status) = 'accepted' 
              ORDER BY discord_id, id DESC
            `, [top5Ids]);
            for (const row of appsRes.rows) {
              idToProfile[row.discord_id] = {
                character_name: row.character_name,
                character_avatar: row.profile_image || null
              };
            }
          }

          // Fetch caller's character info for 'me'
          const myProfileRes = await query(`
            SELECT character_name, profile_image 
            FROM aion2_global_applications 
            WHERE discord_id = $1 AND LOWER(status) = 'accepted' 
            ORDER BY id DESC LIMIT 1
          `, [session.id]);
          if (myProfileRes.rows.length > 0) {
            me.character_name = myProfileRes.rows[0].character_name || null;
            me.character_avatar = myProfileRes.rows[0].profile_image || null;
          }

          const leaderboard = top5.map(r => ({
            rank: r.rank,
            discord_id: r.discord_id,
            character_name: idToProfile[r.discord_id]?.character_name || 'مجهول',
            character_avatar: idToProfile[r.discord_id]?.character_avatar || null,
            total_points: r.total_points,
            completed_groups: r.completed_groups,
            unique_guildmates: r.unique_guildmates
          }));

          send(res, 200, { success: true, cycle: cycleId, me, leaderboard });
          return true;
        }
        if(url.pathname==='/api/auth/aion2-lfg' && req.method==='GET'){
          const groupsRes = await query(`
            SELECT * FROM aion2_lfg_groups 
            WHERE state IN ('RECRUITING', 'FULL_WAITING_FOR_VOICE', 'VOICE_CREATING', 'VOICE_ENTRY', 'ACTIVE', 'AWAITING_VOTE')
            ORDER BY created_at DESC
          `);
          let groups = [];
          for (const g of groupsRes.rows) {
            const isAwaiting = g.state === 'AWAITING_VOTE';
            const isActive = ['FULL_WAITING_FOR_VOICE', 'VOICE_CREATING', 'VOICE_ENTRY', 'ACTIVE'].includes(g.state) || (g.state === 'RECRUITING' && g.first_full_at != null); // ACTIVE conceptually
            
            const membersRes = await query(`SELECT discord_id, assigned_role, player_class, is_creator, is_official_lineup, assigned_party FROM aion2_lfg_members WHERE group_id = $1 AND status = 'ACTIVE' ORDER BY joined_at ASC`, [g.id]);
            
            let isMember = false;
            let isOfficial = false;
            let isCreator = false;
            for (const m of membersRes.rows) {
              if (m.discord_id === session.id) {
                isMember = true;
                if (m.is_official_lineup) isOfficial = true;
                if (m.is_creator) isCreator = true;
              }
            }

            // Only show AWAITING_VOTE to official lineup members
            if (isAwaiting && !isOfficial) continue;

            const isSanctuary = String(g.activity_type || '').toUpperCase() === 'SANCTUARY';
            const isAbyss = String(g.activity_type || '').toUpperCase() === 'ABYSS';
            const isWorldBoss = String(g.activity_type || '').toUpperCase() === 'WORLD_BOSS';
            const guildId = env.DISCORD_GUILD_ID || '1288251216895283281';

            const groupData = {
              id: g.id,
              type: g.activity_type,
              name: g.activity_name,
              mode: g.activity_mode,
              creator: '',
              creator_id: g.creator_id,
              creator_avatar: null,
              capacity: getCapacity(g.activity_type),
              roles: [],
              members: [],
              members_details: [],
              deadline: g.voice_start_deadline ? new Date(g.voice_start_deadline).getTime() : Date.now() + 20*60000,
              status: isAwaiting ? 'awaiting_vote' : (['EXPIRED', 'CANCELLED', 'COMPLETED', 'FAILED'].includes(g.state) ? 'closed' : 'open'),
              state: g.state,
              firstFull: Boolean(g.first_full_at != null || g.state === 'FULL_WAITING_FOR_VOICE'),
              voice_channel_id: g.voice_channel_id || null,
              voice_url: g.voice_channel_id ? `https://discord.com/channels/${guildId}/${g.voice_channel_id}` : null,
              voice_active: ['VOICE_ENTRY', 'ACTIVE'].includes(g.state) && Boolean(g.voice_channel_id),
              can_start_voice: Boolean(isCreator && (g.state === 'FULL_WAITING_FOR_VOICE' || (g.state === 'RECRUITING' && g.first_full_at != null)) && !g.voice_channel_id)
            };
            const slots = groupData.capacity;
            const mappedMembers = new Array(slots).fill(null);
            
            const pseudoRoles = [];
            if (isSanctuary) {
               // 2 Parties of 5: Tank, Healer, 3 DPS each
               pseudoRoles.push('Tank', 'Healer', 'DPS', 'DPS', 'DPS', 'Tank', 'Healer', 'DPS', 'DPS', 'DPS');
            } else if (isAbyss || isWorldBoss) {
               for(let i=0; i<slots; i++) pseudoRoles.push('DPS');
            } else if (slots >= 5) {
               pseudoRoles.push('Tank', 'Healer');
               for(let i=2; i<slots; i++) pseudoRoles.push('DPS');
            } else {
               for(let i=0; i<slots; i++) pseudoRoles.push('DPS');
            }
            groupData.roles = pseudoRoles;
            
            const allDiscordIds = [...new Set([...membersRes.rows.map(m => m.discord_id), g.creator_id].filter(Boolean))];
            const profilesMap = new Map();
            if (allDiscordIds.length > 0) {
              const profsRes = await query(`
                SELECT DISTINCT ON (discord_id) discord_id, character_name, profile_image
                FROM aion2_global_applications
                WHERE discord_id = ANY($1::text[]) AND status = 'ACCEPTED'
                ORDER BY discord_id, id DESC
              `, [allDiscordIds]);
              for (const p of profsRes.rows) {
                profilesMap.set(String(p.discord_id), {
                  character_name: p.character_name || 'Unknown',
                  profile_image: p.profile_image || null
                });
              }
            }

            const membersDetails = [];
            let officialCount = 0;
            for (const mem of membersRes.rows) {
              if (mem.is_official_lineup) officialCount++;
              const prof = profilesMap.get(String(mem.discord_id));
              const charName = prof ? prof.character_name : 'Unknown';
              const charAvatar = prof ? prof.profile_image : null;
              if (mem.is_creator) {
                groupData.creator = charName;
                groupData.creator_avatar = charAvatar;
              }
              
              membersDetails.push({
                discord_id: mem.discord_id,
                character_name: charName,
                character_avatar: charAvatar,
                player_class: mem.player_class,
                assigned_role: mem.assigned_role,
                assigned_party: mem.assigned_party || 1,
                is_creator: Boolean(mem.is_creator)
              });

              const roleNormalized = String(mem.assigned_role || '').trim().toUpperCase();
              let placed = false;

              if (isSanctuary) {
                const partyOffset = (mem.assigned_party === 2) ? 5 : 0;
                if (roleNormalized === 'TANK' && !mappedMembers[partyOffset + 0]) {
                  mappedMembers[partyOffset + 0] = charName;
                  placed = true;
                } else if (roleNormalized === 'HEALER' && !mappedMembers[partyOffset + 1]) {
                  mappedMembers[partyOffset + 1] = charName;
                  placed = true;
                } else if (roleNormalized === 'DPS') {
                  for (let i = 2; i <= 4; i++) {
                    if (!mappedMembers[partyOffset + i]) {
                      mappedMembers[partyOffset + i] = charName;
                      placed = true;
                      break;
                    }
                  }
                }
              } else if (!isAbyss && slots >= 5) {
                // Dungeon & Transcendence
                if (roleNormalized === 'TANK' && !mappedMembers[0]) {
                  mappedMembers[0] = charName;
                  placed = true;
                } else if (roleNormalized === 'HEALER' && !mappedMembers[1]) {
                  mappedMembers[1] = charName;
                  placed = true;
                } else if (roleNormalized === 'DPS') {
                  for (let i = 2; i < slots; i++) {
                    if (!mappedMembers[i]) {
                      mappedMembers[i] = charName;
                      placed = true;
                      break;
                    }
                  }
                }
              }

              // Fallback: place in first available slot if not placed yet
              if (!placed) {
                const emptyIdx = mappedMembers.indexOf(null);
                if (emptyIdx !== -1) {
                  mappedMembers[emptyIdx] = charName;
                }
              }
            }

            // Ensure creator name & avatar are populated even if creator wasn't in active members list
            if (g.creator_id) {
              const creatorProf = profilesMap.get(String(g.creator_id));
              if (!groupData.creator) {
                groupData.creator = creatorProf ? creatorProf.character_name : 'Unknown';
              }
              if (!groupData.creator_avatar) {
                groupData.creator_avatar = creatorProf ? creatorProf.profile_image : null;
              }
            }

            groupData.members = mappedMembers;
            groupData.members_details = membersDetails;

            // Voting variables
            groupData.vote_deadline = g.vote_deadline ? new Date(g.vote_deadline).getTime() : null;
            groupData.yes_count = 0;
            groupData.no_count = 0;
            groupData.required_yes = Math.floor(officialCount / 2) + 1;
            groupData.can_start_vote = false;
            groupData.can_vote = false;
            groupData.can_request_fallback = false;
            groupData.can_confirm_fallback = false;
            groupData.has_voted = false;

            if (isAwaiting) {
              const votesRes = await query(`SELECT discord_id, vote FROM aion2_lfg_votes WHERE group_id = $1`, [g.id]);
              for (const v of votesRes.rows) {
                if (v.vote === 'YES') groupData.yes_count++;
                if (v.vote === 'NO') groupData.no_count++;
                if (v.discord_id === session.id) groupData.has_voted = true;
              }
              if (isOfficial && !groupData.has_voted) groupData.can_vote = true;
            } else if (isActive && isOfficial) {
              if (isCreator) {
                groupData.can_start_vote = true;
              } else {
                const reqRes = await query(`SELECT requester_id FROM aion2_lfg_vote_requests WHERE group_id = $1 AND resolved_at IS NULL AND expires_at > CURRENT_TIMESTAMP`, [g.id]);
                if (reqRes.rowCount === 0) {
                  groupData.can_request_fallback = true;
                } else if (reqRes.rows[0].requester_id !== session.id) {
                  groupData.can_confirm_fallback = true;
                }
              }
            }
            groups.push(groupData);
          }
          send(res, 200, { success: true, groups });
          return true;
        }

        if(url.pathname==='/api/auth/aion2-lfg/create' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.type || !payload.name) {
            send(res, 400, { success: false, status: 'CREATION_FAILED', error: 'INVALID_REQUEST' });
            return true;
          }
          const resObj = await coreCreateGroup(session.id, client, payload.type, payload.name, payload.mode || 'NORMAL');
          if (!resObj.success) {
            send(res, 400, {
              success: false,
              status: resObj.status || 'CREATION_FAILED',
              error: resObj.error || 'فشل إنشاء المجموعة.'
            });
            return true;
          }

          if (resObj.status === 'CREATED_PENDING_PUBLICATION') {
            send(res, 202, {
              success: true,
              status: 'CREATED_PENDING_PUBLICATION',
              groupId: resObj.groupId,
              message: 'تم حفظ المجموعة في قاعدة البيانات وجارٍ نشر الإعلان في ديسكورد.'
            });
            return true;
          }

          send(res, 201, {
            success: true,
            status: 'CREATED_AND_PUBLISHED',
            groupId: resObj.groupId,
            messageId: resObj.messageId
          });
          return true;
        }

        if(url.pathname==='/api/auth/aion2-lfg/join' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.groupId) {
            send(res, 400, { error: 'INVALID_REQUEST' });
            return true;
          }
          const resObj = await coreJoinGroup(session.id, payload.groupId);
          if (!resObj.success) {
            send(res, 400, { error: resObj.error });
          } else {
            send(res, 200, { success: true });
            updateEventsCard(payload.groupId).catch(()=>{});
          }
          return true;
        }

        if(url.pathname==='/api/auth/aion2-lfg/leave' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.groupId) {
            send(res, 400, { error: 'INVALID_REQUEST' });
            return true;
          }
          const resObj = await coreLeaveGroup(session.id, payload.groupId);
          if (!resObj.success) {
            send(res, 400, { error: resObj.error });
          } else {
            send(res, 200, { success: true });
            updateEventsCard(payload.groupId).catch(()=>{});
          }
          return true;
        }
        if(url.pathname==='/api/auth/aion2-lfg/close' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.groupId || !payload.reasonEnum) {
            send(res, 400, { error: 'INVALID_REQUEST' });
            return true;
          }
          const validReasons = ['CHANGE_OF_PLAN', 'GROUP_NOT_FILLED', 'EMERGENCY', 'OTHER'];
          if (!validReasons.includes(payload.reasonEnum)) {
            send(res, 400, { error: 'INVALID_REASON' });
            return true;
          }
          if (payload.reasonEnum === 'OTHER') {
            const custom = (payload.customReason || '').trim();
            if (!custom) {
              send(res, 400, { error: 'CUSTOM_REASON_REQUIRED' });
              return true;
            }
          }
          const resObj = await coreCloseGroup(session.id, payload.groupId, payload.reasonEnum, payload.customReason);
          if (!resObj.success) {
            send(res, 400, { error: resObj.error });
          } else {
            send(res, 200, { success: true });
            updateEventsCard(payload.groupId).catch(()=>{});
          }
          return true;
        }

        if(url.pathname==='/api/auth/aion2-lfg/vote' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.groupId || !payload.action) {
            send(res, 400, { error: 'INVALID_REQUEST' });
            return true;
          }

          let resObj;
          switch (payload.action) {
            case 'START_VOTE':
              resObj = await coreStartCompletionVote(payload.groupId, session.id, client);
              break;
            case 'FALLBACK_REQ':
              resObj = await coreRequestFallbackVote(payload.groupId, session.id);
              break;
            case 'FALLBACK_CONF':
              resObj = await coreConfirmFallbackVote(payload.groupId, session.id, client);
              break;
            case 'SUBMIT_YES':
              resObj = await coreSubmitCompletionVote(payload.groupId, session.id, 'YES');
              break;
            case 'SUBMIT_NO':
              resObj = await coreSubmitCompletionVote(payload.groupId, session.id, 'NO');
              break;
            default:
              send(res, 400, { error: 'INVALID_ACTION' });
              return true;
          }

          if (!resObj.success) {
            send(res, 400, { error: resObj.error });
          } else {
            if (resObj.completed) {
              processPendingLedgers(b4EvaluatorHook, null, client).catch(err => {
                console.error("[Voting Overlay] Immediate post-completion ledger error:", err);
              });
            }
            send(res, 200, { success: true });
          }
          return true;
        }

        if(url.pathname==='/api/auth/aion2-lfg/start-voice' && req.method==='POST'){
          const payload = await body(req);
          if (!payload || !payload.groupId) {
            send(res, 400, { error: 'INVALID_REQUEST' });
            return true;
          }
          try {
            const result = await coreStartVoice(session.id, Number(payload.groupId), client);
            send(res, result.success ? 200 : 400, result);
          } catch(err) {
            console.error('[API:start-voice] Error:', err);
            send(res, 500, { error: 'فشل بدء الروم الصوتي: ' + err.message });
          }
          return true;
        }

        if(url.pathname==='/api/auth/aion2-notifications' && req.method==='GET'){
          const notifsRes = await query(`
            SELECT notification_id, group_id, notification_type, created_at
            FROM aion2_lfg_notifications
            WHERE discord_id = $1
            ORDER BY created_at DESC
            LIMIT 50
          `, [session.id]);
          let broadcasts = [];
          try {
            broadcasts = await getActiveBroadcastAlerts(20);
          } catch (e) {
            console.error('[Broadcasts] Error querying broadcasts in notifications:', e);
          }
          send(res, 200, { success: true, notifications: notifsRes.rows, broadcasts });
          return true;
        }
        if(url.pathname==='/api/auth/aion2-chat' && req.method==='GET'){
          const history = await getChatHistory();
          send(res, 200, { success: true, messages: history });
          return true;
        }
        if(url.pathname==='/api/auth/aion2-chat' && req.method==='POST'){
          const input = await body(req);
          const content = typeof input.content === 'string' ? input.content.trim() : '';
          if (!content) { send(res, 400, { error: 'EMPTY_MESSAGE' }); return true; }
          if (content.length > 2000) { send(res, 400, { error: 'MESSAGE_TOO_LONG' }); return true; }
          
          try {
            const userProfile = await profile(session.id);
            const channel = await client.channels.fetch(TARGET_CHAT_CHANNEL);
            if (!channel) throw new Error("CHANNEL_NOT_FOUND");
            const webhooks = await channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.owner.id === client.user.id);
            if (!webhook) {
              webhook = await channel.createWebhook({ name: "M3RGEEN App Chat", avatar: client.user.displayAvatarURL() });
            }
            let sendContent = content;
            if (sendContent.includes('@') && channel.guild) {
              const cache = channel.guild.members.cache;
              for (const [memId, mem] of cache) {
                const name = mem.displayName || mem.user.username;
                if (!name || name.length < 2) continue;
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const reg = new RegExp(`@${escaped}(?=[\\s,!?]|$)`, 'gi');
                if (reg.test(sendContent)) {
                  sendContent = sendContent.replace(reg, `<@${memId}>`);
                }
              }
            }

            await webhook.send({
              content: sendContent,
              username: userProfile.displayName || "App User",
              avatarURL: userProfile.avatar || "https://cdn.discordapp.com/embed/avatars/0.png"
            });
            chatCacheExpires = 0; // Invalidate cache
            send(res, 200, { success: true });
          } catch (err) {
            console.error("Chat send error:", err);
            send(res, 500, { error: 'SEND_FAILED' });
          }
          return true;
        }
        if(url.pathname==='/api/auth/aion2-guilds' && req.method==='GET'){
          const m3rgeenStats = await getGuildStatsData("M3RGEEN_GLOBAL");
          const emperorStats = await getGuildStatsData("EMPEROR");
          const membersRes = await query(`SELECT discord_id, character_name, selected_class, assigned_guild, profile_image, combat_power FROM aion2_global_applications WHERE LOWER(status) = 'accepted' AND assigned_guild IN ('EMPEROR', 'M3RGEEN_GLOBAL') ORDER BY character_name ASC`);
          enqueueMissingCpMembers().catch(() => {});
          send(res,200,{success:true, stats: { 'M3RGEEN_GLOBAL': m3rgeenStats, 'EMPEROR': emperorStats }, members: membersRes.rows});
          return true;
        }

        if(url.pathname==='/api/auth/aion2-profile/sync' && req.method==='POST'){
          if (activeProfileSyncs.has(session.id)) {
            send(res, 429, { 
              error: 'SYNC_IN_PROGRESS', 
              message: '⏳ عملية مزامنة جارية حالياً، يرجى الانتظار...' 
            });
            return true;
          }

          const lastSync = profileSyncCooldowns.get(session.id) || 0;
          const elapsed = now() - lastSync;
          if (elapsed < SYNC_COOLDOWN_MS) {
            const remaining = Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000);
            send(res, 429, { 
              error: 'COOLDOWN_ACTIVE', 
              retryAfter: remaining,
              message: `⏳ يرجى الانتظار ${remaining} ثانية قبل طلب مزامنة جديدة.` 
            });
            return true;
          }

          const app = await getActiveAion2Application(session.id);
          if (!app) {
            send(res, 403, { 
              error: 'NOT_ELIGIBLE', 
              message: '❌ لا توجد استمارة معتمدة لحسابك في تحالف Emperor أو M3RGEEN Global.' 
            });
            return true;
          }

          if (!app.shugo_url) {
            send(res, 400, { 
              error: 'NO_SHUGO_URL', 
              message: '❌ لا يوجد رابط Shugo.gg مسجل في استمارتك.' 
            });
            return true;
          }

          activeProfileSyncs.add(session.id);
          try {
            let scrapeRes;
            try {
              scrapeRes = await scrapeProfile(app.shugo_url);
            } catch (netErr) {
              send(res, 502, { 
                error: 'SOURCE_UNAVAILABLE', 
                message: `❌ تعذر الاتصال بموقع Shugo.gg حالياً (${netErr.message}). يرجى المحاولة لاحقاً.` 
              });
              return true;
            }

            if (!scrapeRes || !scrapeRes.success || !scrapeRes.data) {
              send(res, 502, { 
                error: 'SOURCE_ERROR', 
                message: scrapeRes?.message || scrapeRes?.error || '❌ تعذر جلب بيانات الشخصية من Shugo.gg.' 
              });
              return true;
            }

            const charData = scrapeRes.data;
            if (!charData.className || charData.className === 'Unknown') {
              send(res, 422, { 
                error: 'INVALID_DATA', 
                message: '❌ تعذر التحقق من كلاس الشخصية من بروفايل Shugo.' 
              });
              return true;
            }

            // Update in database safely using existing update logic
            await updatePlayerProfileFromShugo(session.id, charData);
            profileSyncCooldowns.set(session.id, now());

            const freshUser = await profile(session.id);
            const nowIso = new Date().toISOString();

            send(res, 200, {
              success: true,
              message: 'تمت مزامنة بيانات الشخصية بنجاح من Shugo.gg',
              user: freshUser,
              lastSyncAt: nowIso,
              data: {
                itemLevel: charData.itemLevel !== undefined && charData.itemLevel !== null ? Number(charData.itemLevel) : null,
                combatPower: charData.combatPower !== undefined && charData.combatPower !== null ? Number(charData.combatPower) : null,
                characterLevel: charData.characterLevel !== undefined && charData.characterLevel !== null ? Number(charData.characterLevel) : null,
                className: charData.className || null
              }
            });
            return true;
          } catch(syncErr) {
            console.error('[ProfileSync] Error:', syncErr);
            send(res, 500, { error: 'INTERNAL_ERROR', message: '❌ حدث خطأ داخلي أثناء المزامنة: ' + syncErr.message });
            return true;
          } finally {
            activeProfileSyncs.delete(session.id);
          }
        }
      }
      send(res,404,{error:'AUTH_ROUTE_NOT_FOUND'});
    } catch(error) {send(res,error.message==='INVALID_BODY'?400:503,{error:error.message==='INVALID_BODY'?'INVALID_BODY':'SERVICE_UNAVAILABLE'});}
    return true;
  };
}
