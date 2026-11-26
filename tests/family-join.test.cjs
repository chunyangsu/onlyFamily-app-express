const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ members = [], queryError } = {}) {
  const calls = { queries: [], creates: [] }
  const imports = {
    '@/utils/invitation': {},
    '@/config/env': {},
    '@/models': {
      familyList: {
        async create() {
          return { id: 2 }
        }
      },
      familyUserMap: {
        async findOne(query) {
          calls.queries.push(query)
          if (queryError) throw queryError
          return members.find((member) =>
            String(member.familyId) === String(query.where.familyId) &&
            String(member.userId) === String(query.where.userId)
          ) || null
        },
        async create(params) {
          calls.creates.push(params)
          const member = { id: members.length + 1, ...params }
          members.push(member)
          return member
        }
      }
    },
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {}
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/family.js'), 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return { service: module.exports, calls }
}

test('成员模型使用字符串角色，默认值为 member', () => {
  const { Sequelize, DataTypes } = require('sequelize')
  const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false })
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/models/modules/familyUserMap.js'), 'utf8'), {
    module,
    require(name) {
      if (name === 'sequelize') return { DataTypes }
      if (name === '@/config/database') return sequelize
      throw new Error(`Unexpected import: ${name}`)
    }
  })
  const role = module.exports.rawAttributes.role
  assert.equal(role.type.toSql(), 'VARCHAR(50)')
  assert.equal(role.defaultValue, 'member')
  assert.equal(role.allowNull, false)
})

test('创建家庭时将创建者设为 admin', async () => {
  const { service, calls } = fixture()
  const family = await service.createFamily({ name: '我的家庭', userId: 3 })
  assert.equal(family.id, 2)
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.creates[0].familyId, 2)
  assert.equal(calls.creates[0].userId, 3)
  assert.equal(calls.creates[0].role, 'admin')
})

test('创建家庭时成员查询失败向上传递，不继续创建成员', async () => {
  const error = new Error('Database unavailable')
  const { service, calls } = fixture({ queryError: error })
  await assert.rejects(service.createFamily({ name: '我的家庭', userId: 3 }), (result) => result === error)
  assert.equal(calls.creates.length, 0)
})
