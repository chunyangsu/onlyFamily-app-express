const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ config = {}, assumeRole, realSdk = false } = {}) {
  const RealOSS = realSdk ? require('ali-oss') : null
  let now = realSdk ? Date.now() : Date.parse('2026-11-25T00:00:00.000Z')
  const calls = { sts: [], signatures: [], clients: [] }
  class Clock extends Date {
    static now() {
      return realSdk ? Date.now() : now
    }
  }
  function OSS(options) {
    calls.clients.push(options)
    if (realSdk) return new RealOSS(options)
    this.signatureUrl = (key, { expires }) => {
      calls.signatures.push({ key, expires, token: options.stsToken })
      const url = new URL('https://example.com/' + key)
      url.searchParams.set('Expires', String(Math.floor(now / 1000) + expires))
      url.searchParams.set('security-token', options.stsToken)
      return url.href
    }
  }
  OSS.STS = function () {
    this.assumeRole = async (...args) => {
      calls.sts.push(args)
      if (assumeRole) return assumeRole({ now, args, count: calls.sts.length })
      return {
        credentials: {
          AccessKeyId: 'test-key',
          AccessKeySecret: 'test-secret',
          SecurityToken: `test-token-${calls.sts.length}`,
          Expiration: new Date(now + args[2] * 1000).toISOString()
        }
      }
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/config/oss.js'), 'utf8'), {
    module,
    URL,
    Date: Clock,
    require(name) {
      if (name === 'ali-oss') return OSS
      if (name === '@/config/env')
        return {
          oss: {
            bucket: 'test-bucket',
            region: 'oss-cn-shanghai',
            endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
            accessKeyId: 'test-key',
            accessKeySecret: 'test-secret',
            roleArn: 'test-role',
            readStsTtl: 43200,
            readUrlTtl: 43200,
            ...config
          }
        }
      throw new Error('Unexpected import: ' + name)
    }
  })
  return {
    api: module.exports,
    calls,
    advance: (seconds) => {
      now += seconds * 1000
    },
    now: () => now
  }
}

test('12 小时 STS 签发接近 12 小时的 URL，保留 60 秒安全余量并返回准确到期时间', async () => {
  const { api, calls, now } = fixture()
  const result = await api.getSignedOssUrl(' avatar ')
  assert.equal(calls.sts[0][2], 43200)
  assert.equal(calls.signatures[0].key, 'avatar')
  assert.equal(calls.signatures[0].expires, 43140)
  assert.equal(typeof result.urlExpiresAt, 'number')
  assert.ok(Number.isSafeInteger(result.urlExpiresAt))
  assert.equal(result.urlExpiresAt, now() + 43140 * 1000)
  assert.equal(result.urlExpiresAt, Number(new URL(result.url).searchParams.get('Expires')) * 1000)
  assert.equal(api.ossConfig.region, 'cn-shanghai')
  assert.equal(typeof (await api.getOssUrl('avatar')), 'string')
})

test('到期时间以毫秒数字序列化，秒级签名与非整秒服务器时钟保持一致', async () => {
  const { api, advance, now } = fixture()
  advance(0.123)
  const result = JSON.parse(JSON.stringify(await api.getSignedOssUrl('avatar')))
  assert.equal(typeof result.urlExpiresAt, 'number')
  assert.ok(Number.isSafeInteger(result.urlExpiresAt))
  assert.equal(result.urlExpiresAt, Number(new URL(result.url).searchParams.get('Expires')) * 1000)
  assert.ok(result.urlExpiresAt <= now() + 43140 * 1000)
  assert.equal(now() + 43140 * 1000 - result.urlExpiresAt, 123)
})

test('并发首次签名只申请一次凭证，短暂复用后重新申请以保证接近 12 小时', async () => {
  const { api, calls, advance } = fixture()
  await Promise.all(Array.from({ length: 30 }, (_, i) => api.getSignedOssUrl(`avatar-${i}`)))
  assert.equal(calls.sts.length, 1)
  advance(299)
  const cached = await api.getSignedOssUrl('cached')
  assert.equal(calls.sts.length, 1)
  advance(2)
  const renewed = await api.getSignedOssUrl('renewed')
  assert.equal(calls.sts.length, 2)
  assert.ok(renewed.urlExpiresAt > cached.urlExpiresAt)
  assert.equal(new URL(renewed.url).searchParams.get('security-token'), 'test-token-2')
})

test('在旧地址到期前 5 分钟续签可获得新一轮有效期，旧地址元数据不变', async () => {
  const { api, calls, advance, now } = fixture()
  const original = await api.getSignedOssUrl('avatar')
  const oldExpiration = original.urlExpiresAt
  advance(43140 - 300)
  const renewed = await api.getSignedOssUrl('avatar')
  assert.equal(calls.sts.length, 2)
  assert.equal(renewed.urlExpiresAt, now() + 43140 * 1000)
  assert.equal(original.urlExpiresAt, oldExpiration)
  assert.ok(renewed.urlExpiresAt > oldExpiration)
})

test('自定义短时 URL 复用充足凭证；不足以覆盖时长时刷新，独立读取客户端仍正常工作', async () => {
  const { api, calls, advance } = fixture()
  await api.getOssReadClient()
  advance(3600)
  await api.getSignedOssUrl('avatar', 300)
  assert.equal(calls.sts.length, 1)
  assert.equal(calls.signatures[0].expires, 300)
  advance(43200 - 3600 - 350)
  await api.getSignedOssUrl('avatar', 300)
  assert.equal(calls.sts.length, 2)
})

test('STS 失败合并传播，后续请求可以重试，不返回旧的临期地址', async () => {
  const { api, calls } = fixture({
    assumeRole({ now, count }) {
      if (count === 1) throw new Error('STS unavailable')
      return { credentials: { AccessKeyId: 'id', AccessKeySecret: 'secret', SecurityToken: 'token', Expiration: new Date(now + 43200000).toISOString() } }
    }
  })
  const results = await Promise.allSettled([api.getSignedOssUrl('a'), api.getSignedOssUrl('b')])
  assert.ok(results.every((result) => result.status === 'rejected' && /STS unavailable/.test(result.reason.message)))
  assert.equal(calls.sts.length, 1)
  assert.equal(calls.signatures.length, 0)
  await api.getSignedOssUrl('a')
  assert.equal(calls.sts.length, 2)
})

test('非法参数和配置提前拒绝，不调用 STS', async () => {
  const { api, calls } = fixture()
  for (const key of ['', ' ', null, 123]) await assert.rejects(api.getSignedOssUrl(key), /objectKey/)
  for (const ttl of [0, -1, 1.5, '300', NaN, Infinity, 43201]) await assert.rejects(api.getSignedOssUrl('a', ttl), /有效期/)
  assert.equal(calls.sts.length, 0)
  for (const readStsTtl of [0, 899, 43201, NaN]) assert.throws(() => fixture({ config: { readStsTtl } }), /OSS_READ_STS_TTL/)
  for (const readUrlTtl of [0, -1, 1.5, 43201, NaN]) assert.throws(() => fixture({ config: { readUrlTtl } }), /OSS_READ_URL_TTL/)
})

test('较短的有效期配置可用；旧凭证刷新失败后可再次申请，不签发旧地址', async () => {
  const shorter = fixture({ config: { readStsTtl: 3600, readUrlTtl: 300 } })
  await shorter.api.getSignedOssUrl('avatar')
  assert.equal(shorter.calls.sts[0][2], 3600)
  assert.equal(shorter.calls.signatures[0].expires, 300)

  const { api, calls, advance } = fixture({
    assumeRole({ now, count }) {
      if (count === 2) throw new Error('refresh failed')
      return { credentials: { AccessKeyId: 'id', AccessKeySecret: 'secret', SecurityToken: `token-${count}`, Expiration: new Date(now + 43200000).toISOString() } }
    }
  })
  await api.getSignedOssUrl('avatar')
  advance(301)
  await assert.rejects(api.getSignedOssUrl('avatar'), /refresh failed/)
  assert.equal(calls.signatures.length, 1)
  const renewed = await api.getSignedOssUrl('avatar')
  assert.equal(calls.sts.length, 3)
  assert.equal(new URL(renewed.url).searchParams.get('security-token'), 'token-3')
})

test('拒绝无效、已过期或不足以满足时长的 STS 凭证', async () => {
  for (const expiration of ['invalid', '2026-11-24T00:00:00.000Z', '2026-11-25T00:00:30.000Z', '2026-11-25T01:00:00.000Z']) {
    const { api, calls } = fixture({ assumeRole: () => ({ credentials: { AccessKeyId: 'id', AccessKeySecret: 'secret', SecurityToken: 'token', Expiration: expiration } }) })
    await assert.rejects(api.getSignedOssUrl('a'), /凭证/)
    assert.equal(calls.signatures.length, 0)
  }
  const { api } = fixture({ assumeRole: () => ({ credentials: {} }) })
  await assert.rejects(api.getSignedOssUrl('a'), /凭证/)
})

test('真实 ali-oss 本地签名与到期时间字段一致，不访问阿里云', async () => {
  const { api } = fixture({ realSdk: true })
  const { url, urlExpiresAt } = await api.getSignedOssUrl('avatar')
  const query = new URL(url).searchParams
  assert.ok(query.get('Signature'))
  assert.equal(query.get('security-token'), 'test-token-1')
  // SDK 可能将当前时间向上取整到秒；返回值不能晚于安全截止时间。
  const signedExpiration = Number(query.get('Expires')) * 1000
  assert.equal(typeof urlExpiresAt, 'number')
  assert.ok(Number.isSafeInteger(urlExpiresAt))
  assert.ok(urlExpiresAt <= signedExpiration)
  assert.ok(signedExpiration - urlExpiresAt < 1000)
})
