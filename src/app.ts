// 1. 引入 express 模块
import express from 'express'
import routes from './routes/index'

// 2. 创建应用实例
const app = express()
// 3. 定义端口
const port = 3000

// 4. 定义路由：当用户访问根路径'/'时，返回 'Hello World!'
// app.get('/', (req, res) => {
//   res.send('Hello Express + TypeScript!')
// })
// 所有路由统一加上 /api 前缀
app.use('/api', routes)

// 5. 启动服务器，监听指定端口
app.listen(port, () => {
  // http://localhost:3000 或 http://127.0.0.1:3000
  console.log('http服务启动了！')
})
