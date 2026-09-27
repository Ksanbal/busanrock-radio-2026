#!/usr/bin/env python3
"""Generate all DJ narration clips with Microsoft Edge TTS."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.js"
PRONUNCIATIONS_PATH = ROOT / "scripts" / "pronunciations.json"
AUDIO_ROOT = ROOT / "audio" / "narration"
MANIFEST_PATH = ROOT / "narration.js"

DAY_SPOKEN_LABELS = {
    "2026-10-02": "10월 2일 금요일, 첫째 날",
    "2026-10-03": "10월 3일 토요일, 둘째 날",
    "2026-10-04": "10월 4일 일요일, 마지막 날",
}


def load_radio_data() -> dict:
    source = DATA_PATH.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*const RADIO_DATA = (.*);\s*", source, re.DOTALL)
    if not match:
        raise RuntimeError(f"Could not parse {DATA_PATH}")
    return json.loads(match.group(1))


def pick(lines: list[str], artist_index: int, song_index: int, salt: int = 0) -> str:
    return lines[(artist_index + song_index + salt) % len(lines)]


def build_segments(data: dict, pronunciations: dict[str, str]) -> list[dict[str, str]]:
    segments: list[dict[str, str]] = []
    for day in data["days"]:
        date = day["date"]
        artists = day["artists"]
        segments.append({
            "key": f"{date}/day-opening",
            "path": f"{date}/day-opening.mp3",
            "text": (
                "안녕하세요. 여기는 부국락 이천이십육 라디오입니다. "
                f"{DAY_SPOKEN_LABELS[date]} 라인업, 서른세 팀의 음악을 한 팀씩 만나보겠습니다. "
                "곡이 끝나도 채널은 그대로 두세요. 다음 이야기와 다음 곡이 바로 이어집니다."
            ),
        })

        for artist_index, artist in enumerate(artists):
            spoken_artist = pronunciations.get(artist["artist"], artist["artist"])
            prefix = f"{date}/artist-{artist_index + 1:02d}"
            songs = artist["songs"]
            openings = [
                "자, 이번에 만나볼 뮤지션은",
                "분위기를 바꿔서, 다음 주인공은",
                "계속해서 무대 위에서 만날 이름은",
                "이번 순서의 아티스트는",
            ]
            intro = (
                f"{pick(openings, artist_index, 0)} {spoken_artist}입니다. {artist['intro']} "
                "이 팀의 색깔을 잘 보여주는 세 곡을 차례로 들어보겠습니다."
            )
            segments.append({"key": f"{prefix}/intro", "path": f"{prefix}-intro.mp3", "text": intro})

            first = songs[0]
            first_intro = (
                f"첫 곡은 {spoken_artist}의 {first['title']}입니다. {first['why']} "
                "볼륨을 조금 올리고, 바로 들어보시죠."
            )
            segments.append({
                "key": f"{prefix}/song-1-intro",
                "path": f"{prefix}-song-1-intro.mp3",
                "text": first_intro,
            })

            for next_index in (1, 2):
                previous = songs[next_index - 1]
                upcoming = songs[next_index]
                bridges = [
                    f"방금 들으신 곡은 {spoken_artist}의 {previous['title']}이었습니다.",
                    f"{previous['title']}, 잘 듣고 오셨습니다.",
                    f"지금까지 {spoken_artist}의 {previous['title']}이었고요.",
                ]
                next_cues = (
                    ["두 번째 추천곡은", "이어서 들을 두 번째 곡은", "다음 트랙으로 골라온 곡은"]
                    if next_index == 1
                    else ["세 곡 가운데 마지막 곡은", "이 아티스트의 마지막 추천곡은", "한 곡 더 이어가겠습니다. 곡은"]
                )
                bridge = (
                    f"{pick(bridges, artist_index, next_index, 1)} "
                    f"{pick(next_cues, artist_index, next_index, 2)} {upcoming['title']}입니다. "
                    f"{upcoming['why']} 이어서 들어보시죠."
                )
                segments.append({
                    "key": f"{prefix}/song-{next_index + 1}-bridge",
                    "path": f"{prefix}-song-{next_index + 1}-bridge.mp3",
                    "text": bridge,
                })

            next_artist = artists[artist_index + 1] if artist_index + 1 < len(artists) else None
            if next_artist:
                spoken_next = pronunciations.get(next_artist["artist"], next_artist["artist"])
                transition = f"잠시 뒤에는 {spoken_next}의 이야기와 음악으로 이어가겠습니다."
            else:
                transition = "이제 오늘 준비한 마지막 인사를 전해드릴 시간입니다."
            last = songs[-1]
            outro = (
                f"방금 들으신 곡은 {spoken_artist}의 {last['title']}이었습니다. "
                f"{artist['anecdote']} {transition}"
            )
            segments.append({"key": f"{prefix}/outro", "path": f"{prefix}-outro.mp3", "text": outro})

    return segments


async def render_one(
    segment: dict[str, str],
    voice: str,
    rate: str,
    semaphore: asyncio.Semaphore,
    force: bool,
) -> tuple[str, str]:
    output = AUDIO_ROOT / segment["path"]
    if output.exists() and output.stat().st_size > 2_000 and not force:
        return segment["key"], "cached"

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.mp3")
    async with semaphore:
        for attempt in range(1, 4):
            try:
                communicate = edge_tts.Communicate(segment["text"], voice=voice, rate=rate)
                await communicate.save(str(temporary))
                if temporary.stat().st_size <= 2_000:
                    raise RuntimeError("generated file is unexpectedly small")
                os.replace(temporary, output)
                return segment["key"], "generated"
            except Exception:
                temporary.unlink(missing_ok=True)
                if attempt == 3:
                    raise
                await asyncio.sleep(attempt * 1.5)
    raise AssertionError("unreachable")


async def generate(args: argparse.Namespace) -> None:
    data = load_radio_data()
    pronunciations = json.loads(PRONUNCIATIONS_PATH.read_text(encoding="utf-8"))
    segments = build_segments(data, pronunciations)
    semaphore = asyncio.Semaphore(args.concurrency)

    completed = 0
    generated = 0
    tasks = [
        asyncio.create_task(render_one(segment, args.voice, args.rate, semaphore, args.force))
        for segment in segments
    ]
    for task in asyncio.as_completed(tasks):
        _, status = await task
        completed += 1
        generated += status == "generated"
        if completed % 25 == 0 or completed == len(tasks):
            print(f"{completed}/{len(tasks)} complete ({generated} generated)", flush=True)

    missing = []
    manifest = {}
    for segment in segments:
        path = AUDIO_ROOT / segment["path"]
        if not path.exists() or path.stat().st_size <= 2_000:
            missing.append(str(path))
        manifest[segment["key"]] = f"./audio/narration/{segment['path']}"
    if missing:
        raise RuntimeError(f"Missing or invalid audio files: {missing[:5]}")

    manifest_text = "const NARRATION_AUDIO = " + json.dumps(
        manifest, ensure_ascii=False, indent=2, sort_keys=True
    ) + ";\n"
    MANIFEST_PATH.write_text(manifest_text, encoding="utf-8")
    total_bytes = sum((AUDIO_ROOT / segment["path"]).stat().st_size for segment in segments)
    print(json.dumps({
        "voice": args.voice,
        "rate": args.rate,
        "segments": len(segments),
        "generated": generated,
        "bytes": total_bytes,
        "manifest": str(MANIFEST_PATH),
    }, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="ko-KR-SunHiNeural")
    parser.add_argument("--rate", default="-5%")
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(generate(parse_args()))
