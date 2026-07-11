/**
 * 封装异步函数工具，处理异步返回数据和捕捉错误异常
 * @param {*} fn 异步函数
 * @returns
 */
const asyncHandler = (fn) => (req, res, next) => {
  // 1. 调用传入的异步函数，并传入 req, res, next
  // 2. 使用 Promise.resolve()包裹，确保返回值是一个Promise
  // 3. 如果内部抛出错误，Promise 会自动捕获，并触发.catch()
  // 4. 这里的.catch(next)等价于传统的 try...catch 写法
  Promise.resolve(fn(req, res, next)).catch(next)
}
module.exports = asyncHandler
