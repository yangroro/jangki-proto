type AsyncFunction<T> = () => Promise<T>;

export async function runWithConcurrency<T>(
  tasks: AsyncFunction<T>[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  const runTask = async (task: AsyncFunction<T>, index: number) => {
    const result = await task();
    results[index] = result; // 인덱스에 맞게 결과 저장
  };

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const exec = runTask(task, i).then(() => {
      // 실행 완료된 Promise를 큐에서 제거
      executing.splice(executing.indexOf(exec), 1);
    });
    executing.push(exec);

    // 동시 실행 제한에 도달했다면 하나가 끝날 때까지 대기
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  // 모든 작업이 끝날 때까지 대기
  await Promise.all(executing);

  return results;
}