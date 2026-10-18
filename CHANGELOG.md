# 版本记录

## 1.8.1

- Package the verified public cloud URL and browser shortcut for macOS, Windows and Linux, without shipping credentials or requiring a local runtime for cloud use.
- Show explicit cloud sign-in and sign-out actions. Clear local ledger content and drafts immediately on sign-out, including offline, and require sign-in after reload. Other devices keep their own sessions.
- Guard in-flight authentication and ledger reads against restoring data after sign-out. Document the simple daily flow separately from optional local SQL Server setup.

## 1.8.0

- Add named cloud ledgers under the existing sign-in, with a simple add dialog and selector on computers and phones.
- Scope entries, edits, categories, totals, pagination and SQL to the selected ledger. Preserve per-ledger drafts while switching and independently remember each tab's selection.
- Export all named ledgers in one backup. Back up and verify legacy cloud entries before assigning them to the default ledger.
- Make ledger creation retry-safe and reject duplicate names. Validate SQL syntax trees and scope nested queries, joins, unions, INSERT and UPDATE.

## 1.7.0

- Add an optional Cloudflare Workers + D1 edition with persistent login, isolated auth storage, shared device access, guarded SQL and backup export.
- Add a browser setup wizard and double-click publishing launchers. Back up and verify the initial SQL Server migration; reuse cloud resources and preserve cloud records on updates.
- Simplify the cloud interface: Settings menu, mobile Add entry shortcut and collapsed SQL tools. Preserve local optional passwords and existing ledger behavior.
- Verify real local Worker/D1 behavior, two browser sessions, concurrent edits and publishing recovery without changing personal entries.

## 1.6.0 — 2026-10-16

- SQL 工作台默认恢复 SELECT、INSERT、UPDATE，沿用账单专用权限，不授予数据库管理权限。已有只读账号升级为编辑账号，原账单保持不变。
- 增加访问密码开关，最短 4 字符；新安装默认无密码，升级保留原设置，关闭已有密码需要验证当前密码。
- 启动入口统一为 launch.command / start.command、launch.cmd / start.cmd、start.sh；数据说明、初始密码、测试报告及生成说明文件全部采用英文文件名。
- 旧密码文件只重命名，密码值不变；保留每页 10 条及账单编辑功能。

## 1.5.0 — 2026-10-16

- 增加访问密码、scrypt 密码散列、限速登录、8 小时会话、锁定与修改密码；修改密码撤销其他会话。
- 日常记账使用仅有 SELECT/INSERT/UPDATE 的账号；SQL 工作台使用独立只读账号。启动查询会校验权限，拒绝管理员账号。
- 提供 db:secure 命令，先备份账单再建立专用账号，不修改原账单；提供 db:backup 账单导出备份。
- 本机密钥、凭据和备份保存在权限受限的 .montra 目录，不进入源码分发包；远程 SQL Server 强制验证证书。
- 加强安全响应头、跨站请求拦截、连接/请求限制及 UTF-8 请求体解析。旧版服务必须停止后才能启动加固版。

## 1.4.1 — 2026-10-16

- 三个平台的账单明细统一为每页 10 条，超过 10 条使用上一页/下一页浏览；同步更新中英文页码提示。
- 调整数据库分页偏移与查询数量，验证多页记录不重复、不遗漏以及筛选后回到首页。

## 1.4.0 — 2026-10-16

- macOS、Windows、Linux 共同加入账单逐行编辑：日期、收入/支出、金额、类别及备注。
- 新增独立编辑窗口、取消、⌘/Ctrl+Enter 保存和中英文提示；保存后刷新列表及统计，保留新增表单草稿。
- 更新按编号定位原记录，使用参数化 SQL 与原值原子比较，拒绝覆盖已被其他窗口或 SQL 修改/删除的账单。无需迁移数据库。
- 修复 Mac 启动文件执行权限和测试路径误报，补充浏览器及真实数据库编辑测试。

## 1.3.1 — 2026-10-16

- Linux 默认连接原生或远程 SQL Server，无需 Docker；Windows 保持无 Docker 默认配置，macOS 行为不变。
- Linux 分发包显式设置 SQL_USE_DOCKER=0；补充 Ubuntu 22.04 x64 的原生 SQL Server 安装、Express 选择、服务管理和备份说明。
- 增加缺失密码时也不调用 Docker 的回归验证。
- 三平台共同核心版本同步为 1.3.1；此前提供的 meC.zip Mac 测试压缩包保留原样，不包含本次更新。

## 1.3.0 — 2026-10-16

- macOS：1.3.0-macos；Linux：1.3.0-linux；Windows：1.3.0-windows。
- 新增 Linux start.sh、Windows start.cmd / launch.cmd；保留两个 Mac .command 入口。
- 三个平台共享启动逻辑：安装缺失依赖、读取自定义端口与容器名、复用已有服务、用本平台浏览器打开。
- Windows 默认采用原生 SQL Server，无需 Docker；SQL_USE_DOCKER=0 彻底禁用 Docker 调用。
- 远程数据库无需本机 Docker；读取项目根目录 .env，不依赖调用目录。
- 健康接口、启动日志及界面底部显示版本。
- 四份完整源码包（含通用 source），平台包内含对应使用说明和 release.json / VERSION。
- 修复打包依赖固定 python3 命令、缺少 .github 导致失败，以及 ZIP 丢失 Unix 启动权限的问题。
- 增加各平台环境、安装、连接已有/新账本、日常使用、停止、更新与迁移说明。
- 账单结构和既有记账/SQL 功能保持兼容；不自动创建、迁移或替换个人账本。

## 1.2.1

已有中英文记账界面、SQL 工作台和 macOS 启动入口。
