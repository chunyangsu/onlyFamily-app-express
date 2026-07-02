// // 引入express
const express = require('express')
// 创建实例
const app = express()
// 引入汇聚后的总路由
const routes = require('./routes')

const port = 3000

// 基础路由
// app.get('/', (req, res) => {
//   res.send('Hello World!')
// })
// 挂载所有路由，统一加上 /api 前缀
app.use('/api', routes)

// 启动服务器
app.listen(port, () => {
  // http://localhost:3000
  console.log('http服务启动了！')
})
