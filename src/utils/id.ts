export function generateId(): string {
  // 16자리 랜덤 문자열 생성
  return Math.random().toString(36).substring(2, 15);
}
