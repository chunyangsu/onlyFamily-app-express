const fs = require('fs')
const path = require('path')

/**
 * 自动加载指定目录下的所有 .js 文件
 * @param {string} dirPath 目标目录的绝对路径
 * @returns {Array} 模块对象数组
 */
const autoLoadModules = (dirPath) => {
  const moduleArr = []

  // 安全检查：如果传入的文件夹路径不存在，直接返回空数组，防止程序崩溃
  if (!fs.existsSync(dirPath)) return moduleArr
  // 遍历文件夹，读取该目录下的所有文件名，返回一个数组
  fs.readdirSync(dirPath).forEach((item) => {
    // 过滤非js文件
    if (!item.endsWith('.js')) return
    // 提取文件名(不含.js)
    const fileName = item.replace('.js', '')
    // 动态引入该文件内容(该文件module.exports 导出的内容)
    const fileContent = require(path.join(dirPath, item))

    moduleArr.push({
      name: fileName,
      content: fileContent,
    })
  })

  return moduleArr
}

module.exports = autoLoadModules
