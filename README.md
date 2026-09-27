# 부국락 2026 라디오 가이드

부산국제록페스티벌 2026 최종 라인업 99팀의 소개와 대표곡 297곡을 날짜별로 이어 듣는 PWA 라디오 웹사이트입니다.

## 방송 흐름

- 날짜별 DJ 오프닝
- 아티스트 소개
- 첫 곡 소개 → 음악
- 곡 종료 멘트와 다음 곡 소개 → 음악
- 세 번째 곡 뒤 에피소드와 다음 아티스트 예고
- Media Session 이전·다음·재생·일시정지 제어
- 홈 화면 설치 및 서비스 워커 앱 셸 캐시
- 지원 브라우저에서 화면 켜두기(Wake Lock)

## 저작권 방식

- 음원을 다운로드하거나 이 저장소에 포함하지 않습니다.
- 소개와 곡 사이 멘트 498개는 Microsoft Edge TTS `ko-KR-SunHiNeural`로 미리 생성한 MP3를 재생합니다.
- 생성 음원이 누락되거나 로드되지 않으면 브라우저의 한국어 Speech Synthesis로 대체합니다.
- 음악은 권리자가 게시한 YouTube 영상의 IFrame API 임베드로 재생합니다.
- 일부 DJ 믹스는 SoundCloud 공개 플레이어로 재생합니다.
- 임베드가 금지된 영상은 원본 링크를 표시하고 자동으로 건너뜁니다.

## 백그라운드 재생 제한

PWA와 Media Session API를 이용해 탭 전환 및 잠금화면 제어를 지원합니다. 다만 YouTube IFrame 재생은 운영체제·브라우저·YouTube 정책의 영향을 받으므로 iPhone 화면 잠금 상태에서는 중단될 수 있습니다. 사이트의 `화면 켜두기` 기능은 이를 피하기 위한 보조 수단입니다.

## 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다. 브라우저 자동재생 정책 때문에 최초 시작은 사용자가 버튼을 눌러야 합니다.

## 해설 음원 다시 생성

```bash
python3 -m pip install -r requirements.txt
python3 scripts/generate_edge_narration.py
```

기본 설정은 `ko-KR-SunHiNeural`, 속도 `-5%`입니다. 생성 결과는 `audio/narration/`과 `narration.js`에 저장됩니다.
