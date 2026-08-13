// 服务启动钩子:进程一启动即触发词典全量后台加载,
// 让首次查询命中句柄缓存、秒回。加载本身在后台分批执行,
// register 只负责触发,不阻塞服务就绪。
export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    import("./lib/dicts").then(({ getManager }) => getManager());
  }
}
