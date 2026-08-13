// 每词典自定义 CSS 的存储(用户样式覆盖词典自带样式)。
//
// 存放位置:索引缓存目录的同级 user-css/ 目录
// (默认 ~/.mdictfe/user-css,与 index 平级)——
// 独立于索引缓存:清空 ~/.mdictfe/index 重建 .idx 不影响 CSS。
// 文件名:词典路径 UTF-8 的 MD5 + ".css"(与 mdictcc 的 .idx 命名同思路,
// 纯 ASCII、免中文/特殊字符路径问题;词典 id 是扫描序号会漂移,路径才稳定)。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { indexDirPath } from "./mdict";

/** user-css 目录:索引目录的父级 + "user-css"(与 index 平级)。 */
export function userCssDir(): string {
  return path.join(path.dirname(indexDirPath()), "user-css");
}

/** 词典对应的 user css 文件路径。 */
export function userCssPath(dictPath: string): string {
  const hash = crypto.createHash("md5").update(dictPath, "utf8").digest("hex");
  return path.join(userCssDir(), `${hash}.css`);
}

/** 读取词典的自定义 CSS;无则返回空串。 */
export function readUserCss(dictPath: string): string {
  const p = userCssPath(dictPath);
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/** 写入词典的自定义 CSS(自动建目录,UTF-8)。 */
export function writeUserCss(dictPath: string, css: string): void {
  const p = userCssPath(dictPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, css, "utf8");
}

/** 删除词典的自定义 CSS;不存在时静默。 */
export function deleteUserCss(dictPath: string): void {
  try {
    fs.unlinkSync(userCssPath(dictPath));
  } catch {
    /* 不存在即视为已清除 */
  }
}
