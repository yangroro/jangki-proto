# 장끼 매칭 동작 방식

## 1. 이미지 처리

### 1.1 이미지 비율 판단

- 이미지 가로 세로 비율이 1:8 이상인 경우:
  - 이미지 split 처리
    1. 이미지 이진화 처리
    2. 이진화된 이미지를 여러 장으로 나누기
    3. 나누는 기준:
       - 최대 높이 1500px
       - 이진화된 결과물에서 10px 이상 흰색 줄이 있으면 해당 줄을 기준으로 나눔
- 이미지 가로 세로 비율이 1:8 미만인 경우:
  - 이미지 그대로 사용

## 2. OCR 처리

1. 이미지 OCR API 호출
2. OCR confidence 출력
3. 이미지가 여러 장인 경우 OCR 결과 합치기:
   - confidence: 평균값 사용
   - words: 각 이미지의 boundingBox에 y좌표값을 수정하여 최종 좌표 생성

## 3. LLM 처리

1. OCR 결과물로 LLM API 호출

## 4. 결과 검증

### 4.1 검증 방법

1. 마크다운 출력 결과 처리:
   - 가장 앞줄에 ``` 있는 경우, 해당 부분을 제외하고 나머지 부분 검증
2. CSV 형식 유지 여부 검증
3. 영수증 헤더 검증
4. 영수증 총액 검증:
   - 영수증 총액만 추출하는 LLM 호출
   - 추출된 총액과 CSV의 총액 비교
