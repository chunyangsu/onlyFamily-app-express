const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

function fixture({ members = [], avatarUrl = 'https://example.com/signed-avatar', newUser = false, signatureError } = {}) {
  const calls = { memberships: [], signatures: [], creates: [] }
  const user = { id: 8, unionid: 'union' }
  const imports = {
    '@/models': {
      userList: {
        findOne: async () => (newUser ? null : user),
        create: async (data) => {
          calls.creates.push(data)
          return user
        }
      },
      familyUserMap: {
        findAll: async (query) => {
          calls.memberships.push(query)
          return members.slice(0, query.limit)
        }
      }
    },
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {
      getAttachmentList: async (ids) => {
        calls.signatures.push(Array.from(ids))
        if (signatureError) throw signatureError
        return [{ id: ids[0], url: avatarUrl }]
      }
    },
    '@/utils/jwt': { generateToken: (id) => `token-${id}` },
    '@/services/common/wechat': { getWechatSession: async () => ({ openid: 'openid', unionid: 'union' }) }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/user.js'), 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return { service: module.exports, calls }
}

const member = { familyId: 6, nickname: '家庭内昵称', userAvatarId: 42 }

test('单家庭登录返回该家庭的成员昵称、头像 ID 和签名 URL', async () => {
  const { service, calls } = fixture({ members: [member] })
  const result = await service.login('code')
  assert.equal(result.token, 'token-8')
  assert.deepEqual(JSON.parse(JSON.stringify(result.userInfo)), {
    id: 8,
    familyId: 6,
    avatarId: 42,
    avatarUrl: 'https://example.com/signed-avatar',
    nickname: '家庭内昵称'
  })
  assert.equal(calls.memberships[0].where.userId, 8)
  assert.equal(calls.memberships[0].limit, 2)
  assert.deepEqual(calls.signatures, [[42]])
})

test('无家庭、多家庭不自动选择，不读取任何头像', async () => {
  for (const members of [[], [member, { ...member, familyId: 7 }]]) {
    const { service, calls } = fixture({ members })
    const result = await service.login('code')
    assert.deepEqual(JSON.parse(JSON.stringify(result.userInfo)), { id: 8, familyId: 0, avatarId: 0, avatarUrl: '', nickname: '' })
    assert.equal(calls.signatures.length, 0)
  }
})

test('单家庭未设置头像时返回昵称和空 URL，不调用签名方法', async () => {
  const { service, calls } = fixture({ members: [{ ...member, userAvatarId: 0 }] })
  const result = await service.login('code')
  assert.equal(result.userInfo.nickname, member.nickname)
  assert.equal(result.userInfo.familyId, 6)
  assert.equal(result.userInfo.avatarId, 0)
  assert.equal(result.userInfo.avatarUrl, '')
  assert.equal(calls.signatures.length, 0)
})

test('关联头像附件不存在时保留绑定 ID，URL 返回空字符串', async () => {
  const { service } = fixture({ members: [member], avatarUrl: null })
  const result = await service.login('code')
  assert.equal(result.userInfo.avatarId, 42)
  assert.equal(result.userInfo.avatarUrl, '')
})

test('新用户仍正常注册登录，未关联家庭返回默认资料', async () => {
  const { service, calls } = fixture({ newUser: true })
  const result = await service.login('code')
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.creates[0].openid, 'openid')
  assert.equal(result.token, 'token-8')
  assert.equal(result.userInfo.familyId, 0)
})

test('签名服务异常正常向上传递，不返回伪造的头像地址', async () => {
  const error = new Error('OSS unavailable')
  const { service } = fixture({ members: [member], signatureError: error })
  await assert.rejects(service.login('code'), (result) => result === error)
})
