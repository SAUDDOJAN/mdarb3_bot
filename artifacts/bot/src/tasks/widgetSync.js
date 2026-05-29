import fs from 'fs';
import path from 'path';

export function startWidgetSync(client) {
    console.log("[WidgetSync] Started widget synchronization task.");
    
    // التحديث كل 15 ثانية
    setInterval(async () => {
        try {
            const guild = client.guilds.cache.get('861355983975874601');
            if (!guild) return;

            const totalMembers = guild.memberCount;
            let onlineMembers = 0;
            try {
                const widgetRes = await fetch('https://discord.com/api/guilds/861355983975874601/widget.json');
                const widgetData = await widgetRes.json();
                if (widgetData && widgetData.presence_count) {
                    onlineMembers = widgetData.presence_count;
                }
            } catch(e) {}

            // البحث عن قنوات الجنرال (عربي وانجليزي وحتى الحروف المزخرفة)
            const targetNames = ['الجنرال', 'جنرال', 'general', 'ɢᴇɴᴇʀᴀʟ'];
            const channels = [];

            const allChannels = await guild.channels.fetch();
            allChannels
                .filter(c => c && c.isVoiceBased() && targetNames.some(name => c.name.toLowerCase().includes(name)))
                .forEach(c => {
                    const members = c.members.map(m => ({
                        id: m.id,
                        name: m.displayName,
                        avatar: m.user.displayAvatarURL({ extension: 'png', size: 64, forceStatic: true }),
                        isMuted: m.voice.selfMute || m.voice.serverMute,
                        isDeafened: m.voice.selfDeaf || m.voice.serverDeaf
                    }));
                    
                    channels.push({
                        id: c.id,
                        name: c.name,
                        members: members
                    });
                });

            // ترتيب القنوات إذا أمكن
            channels.sort((a, b) => a.name.localeCompare(b.name));

            const data = {
                total: totalMembers,
                online: onlineMembers > totalMembers ? totalMembers : onlineMembers,
                channels: channels,
                updatedAt: new Date().toISOString()
            };

            const outPath = path.resolve('../website/widget_data.js');
            fs.writeFileSync(outPath, `window.DISCORD_WIDGET_DATA = ${JSON.stringify(data)};`);
            globalThis.widgetData = data;
            
        } catch(err) {
            console.error('[WidgetSync] Error:', err.message);
        }
    }, 5000); // 5 ثواني للتحديث السريع جداً
}
