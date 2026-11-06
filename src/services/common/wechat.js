const env = require('@/config/env')

/**
 * 微信小程序登录凭证校验
 * 使用 code 获取 openid、session_key、unionid
 * code：前端传入
 */
const getWechatSession = async (code) => {
  const { appId, appSecret } = env.wechat

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: 'authorization_code'
  })
  const url = `https://api.weixin.qq.com/sns/jscode2session?${params}`
  // 微信接口调用使用 Node.js 原生 fetch，不额外引入 axios
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) {
    throw new Error('微信登录服务请求失败')
  }

  const result = await response.json()
  // 微信接口返回错误
  if (result.errcode) {
    const error = new Error(`微信登录失败：${result.errmsg || '未知错误'}`)
    error.wechatCode = result.errcode
    throw error
  }
  if (!result.openid || !result.session_key) {
    throw new Error('微信登录返回数据异常')
  }

  return {
    openid: result.openid,
    unionid: result.unionid || '',
    sessionKey: result.session_key
  }
}

module.exports = {
  getWechatSession
}
