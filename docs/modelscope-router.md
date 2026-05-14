# ModelScope Router 联调

1. 先启动 `ModelScopeApiRouter`，确保 `http://127.0.0.1:2166/v1` 可用。
2. 打开 `gpt_image_playground` 时，直接访问：
   `http://127.0.0.1:5173/?apiUrl=http://127.0.0.1:2166/v1&apiKey=local-router&model=txt2img`
3. 前端会自动创建一个 `OpenAI 兼容接口` 配置，并指向本地路由。
4. 直接开始文生图；图生图同样走前端原生的 `/v1/images/edits`。

当前推荐方案不再依赖“自定义服务商导入”入口。
`apiKey=local-router` 只是占位值，当前路由不会校验这个值。
