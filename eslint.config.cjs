const js = require('@eslint/js')
const prettierConfig = require('eslint-config-prettier')
// 引入 globals
const globals = require('globals')

module.exports = [
  // 配置需要忽略代码校验的文件
  {
    ignores: ['dist/', 'node_modules/', '*.config.js']
  },
  // 引入 JS 推荐规则
  js.configs.recommended,
  // 自定义项目规则
  {
    // 声明当前项目使用的是CommonJS规范
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs', // 关键：将默认的 'module' 改为 'commonjs'
      // 显式声明 Node.js 和 CommonJS 的全局变量
      globals: {
        ...globals.node, // 注入 process, console, Buffer 等 Node.js 全局变量
        ...globals.commonjs // 注入 require, module, exports 等 CommonJS 变量
      }
    },
    rules: {
      eqeqeq: 'error', // 要求使用 === 和 !==
      semi: ['error', 'never'], // 不要分号
      'no-multi-str': 'error', // 禁止出现多行字符串，可以使用模板字符串换行
      'no-multi-spaces': 'error', // 禁止出现多个空格，如===前后可以有一个空格，但是不能有多个空格
      'semi-spacing': 'error', // 强制分号后面有空格，如for (let i=0; i<20; i++)
      'block-spacing': 'error', // 强制函数/循环等块级作用域中的花括号内前后有一个空格（对象除外）
      'brace-style': ['error', '1tbs', { allowSingleLine: true }], // if/elseif/else左花括号要跟if..同行，右花括号要换行；或者全部同一行
      'func-call-spacing': 'error', // 禁止函数名和括号之间有个空格
      'jsx-quotes': 'error', // 强制在jsx中使用双引号
      'key-spacing': 'error', // 强制对象键值冒号后面有一个空格
      'no-multiple-empty-lines': 'error', // 限制最多出现两个空行
      'nonblock-statement-body-position': 'error', // 强制单行语句不换行
      'object-curly-spacing': ['error', 'always'], // 强制对象/解构赋值/import等花括号前后有空格
      'space-before-blocks': 'error', // 强制块（for循环/if/函数等）前面有一个空格，如for(...){}是错的，花括号前面要空格：for(...) {}
      'space-infix-ops': 'error', // 强制操作符（+-/*）前后有一个空格
      'spaced-comment': 'error', // 强制注释（//或/*）后面要有一个空格
      'arrow-spacing': 'error', // 要求箭头函数的=>前后有空格
      'no-duplicate-imports': 'error', // 禁止重复导入
      'no-else-return': 'error', // 如果if语句里面有return，后面不能跟else语句
      'no-unused-vars': 'warn' // 声明了但未使用的变量/函数，作警告处理
    }
  },
  // 引入 Prettier 配置（必须放在最后）
  prettierConfig
]
