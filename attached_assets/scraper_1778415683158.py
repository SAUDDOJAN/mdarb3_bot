"""Scraper for shugo.gg AION 2 character profiles.

shugo.gg is a single-page app: profile data is loaded asynchronously from
NCsoft's API via the shugo.gg proxy at /api/proxy?url=...

A profile URL looks like:
    https://shugo.gg/character?id=<characterId>&server=<serverId>&region=TW
"""
from __future__ import annotations

import logging
import re
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any, Optional

import cloudscraper
from bs4 import BeautifulSoup

log = logging.getLogger("recruit-bot.scraper")


@dataclass
class PlayerProfile:
    name: str
    level: str
    char_class: str
    combat_power: str
    url: str
    avatar_url: Optional[str] = None
    combat_power_value: Optional[int] = None


# classId / pcId -> class name (extracted from shugo.gg main bundle)
CLASS_MAP: dict[int, str] = {
    0: "All Classes",
    2: "Gladiator", 5: "Gladiator", 6: "Gladiator", 7: "Gladiator", 8: "Gladiator",
    3: "Templar", 9: "Templar", 10: "Templar", 11: "Templar", 12: "Templar",
    4: "Ranger", 13: "Ranger", 14: "Ranger", 15: "Ranger", 16: "Ranger",
    17: "Assassin", 18: "Assassin", 19: "Assassin", 20: "Assassin",
    21: "Spiritmaster", 22: "Spiritmaster", 23: "Spiritmaster", 24: "Spiritmaster",
    25: "Sorcerer", 26: "Sorcerer", 27: "Sorcerer", 28: "Sorcerer",
    29: "Cleric", 30: "Cleric", 31: "Cleric", 32: "Cleric",
    33: "Chanter", 34: "Chanter", 35: "Chanter", 36: "Chanter",
}

REGION_API_BASES: dict[str, str] = {
    "TW": "https://tw.ncsoft.com/aion2",
    "KR": "https://aion2.plaync.com",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Persistent cloudscraper session (reuses cookies/Cloudflare clearance)
_scraper = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "windows", "mobile": False}
)
_scraper.headers.update(
    {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Referer": "https://shugo.gg/",
        "Origin": "https://shugo.gg",
    }
)

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 1.5


def _parse_shugo_url(url: str) -> tuple[str, str, str]:
    parsed = urllib.parse.urlparse(url)
    if "shugo.gg" not in (parsed.netloc or ""):
        raise ValueError("URL must be a shugo.gg profile URL")

    qs = urllib.parse.parse_qs(parsed.query)
    char_id = (qs.get("id") or qs.get("characterId") or [""])[0]
    server_id = (qs.get("server") or qs.get("serverId") or [""])[0]
    region = (qs.get("region") or ["TW"])[0].upper()

    if not char_id or not server_id:
        raise ValueError(
            "shugo.gg URL must contain `id` and `server` query parameters "
            "(e.g. https://shugo.gg/character?id=...&server=...&region=TW)"
        )
    if region not in REGION_API_BASES:
        raise ValueError(f"Unsupported region '{region}'. Use TW or KR.")

    return char_id, server_id, region


def _via_proxy(target_url: str) -> str:
    # The inner URL is already in its decoded form. Encode it exactly ONCE
    # so the proxy receives a well-formed query parameter and decodes back
    # to the original NCsoft URL. Encoding parts of the inner URL beforehand
    # would cause double-encoding (e.g. `=` -> `%3D` -> `%253D`).
    return f"https://shugo.gg/api/proxy?url={urllib.parse.quote(target_url, safe='')}"


def _fetch_json(url: str) -> dict[str, Any]:
    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = _scraper.get(url, timeout=30)
        except Exception as e:
            last_error = e
            log.warning("Attempt %d/%d failed with exception: %s", attempt, MAX_RETRIES, e)
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
            continue

        if response.status_code == 200:
            try:
                return response.json()
            except ValueError:
                log.error(
                    "Non-JSON response from %s\nBody (first 800 chars):\n%s",
                    url,
                    response.text[:800],
                )
                raise ValueError("Profile API returned non-JSON response")

        # Retry on transient server errors and rate limits
        if response.status_code in (429, 500, 502, 503, 504):
            log.warning(
                "Attempt %d/%d: upstream %s for %s. Retrying...\nBody (first 400 chars):\n%s",
                attempt,
                MAX_RETRIES,
                response.status_code,
                url,
                response.text[:400],
            )
            last_error = RuntimeError(f"Upstream returned {response.status_code}")
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
            continue

        log.error(
            "Upstream returned %s for %s\nHeaders: %s\nBody (first 800 chars):\n%s",
            response.status_code,
            url,
            dict(response.headers),
            response.text[:800],
        )
        response.raise_for_status()

    raise RuntimeError(
        f"Failed to fetch profile after {MAX_RETRIES} attempts: {last_error}"
    )


def _find_key(data: Any, key: str) -> Optional[Any]:
    """Recursively search the entire JSON tree for the first occurrence of `key`."""
    if isinstance(data, dict):
        if key in data and data[key] not in (None, ""):
            return data[key]
        for v in data.values():
            found = _find_key(v, key)
            if found not in (None, ""):
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_key(item, key)
            if found not in (None, ""):
                return found
    return None


def _extract_field(data: Any, *keys: str) -> Optional[Any]:
    """Search the JSON tree for each candidate key in order, exhausting the
    full tree before moving on to the next candidate. This avoids picking up
    a generic `name` from a nested object (e.g. a title/legion entry) when a
    more specific key like `characterName` exists deeper in the payload."""
    for k in keys:
        found = _find_key(data, k)
        if found not in (None, ""):
            return found
    return None


def _resolve_class(data: Any) -> str:
    raw = _extract_field(data, "className", "class_name", "jobName")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    cid = _extract_field(data, "pcId", "classId", "class")
    try:
        cid_int = int(cid) if cid is not None else None
    except (TypeError, ValueError):
        cid_int = None
    if cid_int is not None and cid_int in CLASS_MAP:
        return CLASS_MAP[cid_int]
    return "Unknown"


def _resolve_image(data: Any, region: str) -> Optional[str]:
    img = _extract_field(data, "profileImg", "profileImage", "profileImageUrl")
    if not isinstance(img, str) or not img.strip():
        return None
    if img.startswith("http"):
        return img
    base = "https://tw.ncsoft.com" if region == "TW" else "https://aion2.plaync.com"
    return base + img


def fetch_profile(url: str) -> PlayerProfile:
    char_id, server_id, region = _parse_shugo_url(url)

    api_base = REGION_API_BASES[region]
    info_path = "/api/character/info" if region == "TW" else "/ko-kr/api/character/info"
    # `char_id` was already decoded by `parse_qs`; insert it raw so that
    # encoding only happens once when the inner URL is wrapped by `_via_proxy`.
    inner_url = (
        f"{api_base}{info_path}?lang=en"
        f"&characterId={char_id}"
        f"&serverId={server_id}"
    )
    info_url = _via_proxy(inner_url)

    log.info("Fetching profile via proxy: %s", info_url)
    data = _fetch_json(info_url)

    # Strictly prefer the specific character-name keys. Only fall back to the
    # generic `name` field if none of the specific keys are present anywhere.
    name = _extract_field(
        data, "characterName", "charName", "pcName", "nickName", "nickname"
    )
    if name in (None, ""):
        name = _find_key(data, "name")
    if isinstance(name, str):
        name = BeautifulSoup(name, "html.parser").get_text().strip()  # strip <strong> tags
    name_str = str(name).strip() if name else "Unknown"
    log.info("Resolved character name: %r", name_str)

    level_val = _extract_field(data, "level", "characterLevel")
    level_str = str(level_val) if level_val not in (None, "") else "Unknown"

    char_class = _resolve_class(data)

    cp_val = _extract_field(data, "gearScore", "combatPower", "cp", "powerScore")
    cp_int: Optional[int] = None
    if cp_val is None:
        log.error(
            "No combat power field found. Top-level keys=%s. Raw payload (truncated):\n%s",
            list(data.keys()) if isinstance(data, dict) else type(data).__name__,
            str(data)[:1500],
        )
        cp_str = "Unknown"
    else:
        try:
            cp_int = int(cp_val)
            cp_str = f"{cp_int:,}"
        except (TypeError, ValueError):
            cp_str = str(cp_val)

    profile = PlayerProfile(
        name=name_str or "Unknown",
        level=level_str or "Unknown",
        char_class=char_class or "Unknown",
        combat_power=cp_str or "Unknown",
        url=url,
        avatar_url=_resolve_image(data, region),
        combat_power_value=cp_int,
    )

    if "Unknown" in (profile.name, profile.level, profile.char_class, profile.combat_power):
        log.warning(
            "Some fields missing for %s. Result=%s. Raw payload (truncated):\n%s",
            url,
            profile,
            str(data)[:2000],
        )

    return profile
