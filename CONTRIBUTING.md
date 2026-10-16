# 参与贡献

欢迎改进界面、修复问题、补充 SQL 示例和测试。

1. 安装 Node.js 22+，运行 `npm ci`。
2. 使用自己独立的练习数据库。不要用个人账本测试 INSERT、UPDATE、DELETE。
3. 修改后运行 `npm test`。
4. 界面变更可运行 `npx playwright install chromium` 和 `npm run test:browser`。
5. 提交时说明改变了什么、为何改变、如何验证。

不要提交 `.env`、数据库密码、备份、个人账单或包含私人数据的截图。新增依赖需要同时提交 package-lock.json。

项目使用 MIT 许可证，贡献代码沿用此许可证。

## 三平台维护

从通用 source 包或完整仓库运行打包会输出三个平台包和通用包；从单一平台包运行打包只重新生成该平台包。各平台包需要本平台运行环境，不包含其他平台的启动入口。

共享版本号以 package.json 为准，同时更新 package-lock.json、VERSION、CHANGELOG 与三个平台说明。不要分别维护三份核心代码。scripts/package.mjs 会生成四个安装式源码包及各自 release.json，打包需要 Python 3.9+。在 Windows、macOS、Linux 分别运行 npm ci、npm test、npm run package；GitHub Actions 已配置 Node.js 22/24 的三系统矩阵。未运行的远端 CI 不等于已完成真机验证。
