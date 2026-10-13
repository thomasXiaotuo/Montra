# 参与贡献

欢迎改进界面、修复问题、补充 SQL 示例和测试。

1. 安装 Node.js 22+，运行 `npm ci`。
2. 使用自己独立的练习数据库。不要用个人账本测试 INSERT、UPDATE、DELETE。
3. 修改后运行 `npm test`。
4. 界面变更可运行 `npx playwright install chromium` 和 `npm run test:browser`。
5. 提交时说明改变了什么、为何改变、如何验证。

不要提交 `.env`、数据库密码、备份、个人账单或包含私人数据的截图。新增依赖需要同时提交 package-lock.json。

项目使用 MIT 许可证，贡献代码沿用此许可证。
