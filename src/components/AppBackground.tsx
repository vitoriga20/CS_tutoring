// from: grad // 应用背景层（结构参照 chat 项目 AppBackground：fixed 铺满视口的背景层；
// 装饰内容取 grad-app-shell.css .main::before 的网格 + 黄晕 + 径向遮罩，逐字见 grad-ui.css）
// 偏差说明：chat 版依赖游戏实景图与 APP_MASK_BG 常量，素材不在本仓库，
// 背景底色由 tokens --bg-deep 承担（T-M3-1 布局壳随底座移植项）。
export default function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg__grid" />
    </div>
  );
}
