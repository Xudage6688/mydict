// 每词典自定义 CSS 的前端 store(进程内):
// 缓存各词典的 CSS + 订阅通知。保存/清除样式时更新 store 并 notify,
// 让已挂载的结果卡片立即重渲染,无需刷新页面。
type Listener = () => void;

const cache = new Map<number, string>();
const loaded = new Set<number>(); // 已从服务端加载过的词典 id(含"确无样式")
const listeners = new Set<Listener>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** 词典当前生效的 CSS(未加载/无样式都返回空串)。 */
export function getUserCss(id: number): string {
  return cache.get(id) ?? "";
}

/** 是否已从服务端加载过该词典(避免重复 fetch)。 */
export function isUserCssLoaded(id: number): boolean {
  return loaded.has(id);
}

/** 更新缓存并通知订阅者(保存/首次 fetch 后调用)。 */
export function setUserCss(id: number, css: string): void {
  cache.set(id, css);
  loaded.add(id);
  notify();
}

/** 清除缓存并通知订阅者(清除样式后调用)。 */
export function clearUserCssCache(id: number): void {
  cache.delete(id);
  loaded.delete(id);
  notify();
}

/** 订阅变更,返回取消函数。 */
export function subscribeUserCss(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
