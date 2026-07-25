const fs = require('fs')
const path = require('path')

/**
 * 递归自动加载指定目录下的所有 .js 文件
 * @param {string} dirPath 目标目录的绝对路径
 * @returns {Array} 模块对象数组 [{ name, content }]
 */
const autoLoadModules = (dirPath) => {
  const moduleArr = []

  // 安全检查：如果传入的文件夹路径不存在，直接返回空数组，防止程序崩溃
  if (!fs.existsSync(dirPath)) return moduleArr

  /**
   * 内部递归扫描函数
   * @param {string} currentDir 当前正在扫描的绝对路径
   */
  const scanDirectory = (currentDir) => {
    const fileArr = fs.readdirSync(currentDir)

    fileArr.forEach((fileName) => {
      const absolutePath = path.join(currentDir, fileName)
      // 如果是目录，继续向下递归扫描
      if (fs.statSync(absolutePath).isDirectory()) {
        scanDirectory(absolutePath)
        return
      }
      // 过滤非 JS 文件（如 .DS_Store）
      if (!fileName.endsWith('.js')) return
      // 过滤掉 index.js 入口文件（避免循环引用或重复加载）
      if (fileName === 'index.js') return
      // 提取文件名(不含.js)
      const moduleName = fileName.replace('.js', '')
      // 动态引入该文件内容(该文件module.exports 导出的内容)
      const moduleContent = require(absolutePath)

      // 校验：引入的文件内容是否导出了有效的函数(避免因为添加了无效的js文件导致扫描遍历过程中报错)
      // 如果模块为空（undefined）或导出的不是函数（如空对象 {}），则跳过并打印警告
      if (typeof moduleContent !== 'function') {
        console.warn(`[autoLoader 警告] 文件 ${moduleName} 未导出有效的函数，已自动过滤。`)
        return
      }

      moduleArr.push({
        name: moduleName,
        content: moduleContent
      })
    })
  }
  // 调用 scanDirectory()
  scanDirectory(dirPath)

  return moduleArr
}

module.exports = autoLoadModules
