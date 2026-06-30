// // 引入express
const express = require('express')
// 创建实例
const app = express()
const port = 3000

// 基础路由
app.get('/', (req, res) => {
  res.send('Hello World!')
})

// 启动服务器
app.listen(port, () => {
  // http://localhost:3000
  console.log('http服务启动了！')
})
