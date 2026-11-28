const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { Sequelize, DataTypes } = require('sequelize')
const { Umzug, memoryStorage } = require('umzug')
const migration = require('../src/migrations/2026112701-create-family-invitation')

// 仅定义模型和生成 SQL，不连接数据库。
const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false })
const modelModule = { exports: {} }
vm.runInNewContext(readFileSync(resolve(__dirname, '../src/models/modules/familyInvitation.js'), 'utf8'), {
  module: modelModule,
  require(name) {
    if (name === 'sequelize') return { DataTypes }
    if (name === '@/config/database') return sequelize
    throw new Error(`Unexpected import: ${name}`)
  }
})
const model = modelModule.exports

test('迁移的字段、默认值、注释、引擎和索引与当前模型一致', async () => {
  const calls = []
  await migration.up({
    context: {
      async createTable(table, fields, options) {
        calls.push('createTable')
        assert.equal(table, model.tableName)
        assert.equal(options.engine, model.options.engine)
        assert.deepEqual(Object.keys(fields), Object.keys(model.rawAttributes))
        for (const [name, field] of Object.entries(fields)) {
          const expected = model.rawAttributes[name]
          assert.equal(sequelize.normalizeDataType(field.type).toSql(), expected.type.toSql(), `${name}.type`)
          for (const key of ['allowNull', 'defaultValue', 'primaryKey', 'autoIncrement', 'comment']) {
            assert.equal(field[key], expected[key], `${name}.${key}`)
          }
        }
      },
      async addIndex(table, fields, options) {
        calls.push(options.name)
        assert.equal(table, model.tableName)
        const expected = model.options.indexes.find((index) => index.name === options.name)
        assert.ok(expected)
        assert.deepEqual(fields, Array.from(expected.fields))
        assert.equal(Boolean(options.unique), Boolean(expected.unique))
      }
    }
  })
  assert.deepEqual(calls, ['createTable', ...model.options.indexes.map((index) => index.name)])
})

test('真实 QueryInterface 生成正确的 MySQL 建表、索引及回滚 SQL', async () => {
  const statements = []
  const originalQuery = sequelize.query
  sequelize.query = async (sql) => {
    statements.push(sql)
    return []
  }
  try {
    const context = sequelize.getQueryInterface()
    await migration.up({ context })
    await migration.down({ context })
    assert.equal(statements.length, 4)
    assert.match(statements[0], /CREATE TABLE IF NOT EXISTS `family_invitation`/)
    assert.match(statements[0], /`id` INTEGER NOT NULL auto_increment/)
    assert.match(statements[0], /`codeHash` CHAR\(64\) NOT NULL/)
    assert.match(statements[0], /`status` VARCHAR\(50\) NOT NULL DEFAULT 'unused'/)
    assert.match(statements[0], /`expiresTime` BIGINT NOT NULL DEFAULT 0/)
    assert.match(statements[0], /PRIMARY KEY \(`id`\)/)
    assert.match(statements[0], /ENGINE=InnoDB/)
    assert.doesNotMatch(statements[0], /`createdAt`|`updatedAt`|FOREIGN KEY/)
    assert.match(statements[1], /ADD UNIQUE INDEX `uk_family_invitation_code_hash` \(`codeHash`\)/)
    assert.match(statements[2], /ADD INDEX `idx_family_invitation_family_inviter_status` \(`familyId`, `inviterId`, `status`\)/)
    assert.match(statements[3], /DROP TABLE IF EXISTS `family_invitation`/)
  } finally {
    sequelize.query = originalQuery
  }
})

test('Umzug v3 能发现迁移、执行一次并回滚', async () => {
  const calls = []
  const umzug = new Umzug({
    migrations: { glob: ['*.js', { cwd: resolve(__dirname, '../src/migrations') }] },
    storage: memoryStorage(),
    context: {
      async createTable(table) {
        calls.push(`create:${table}`)
      },
      async addIndex(table, fields, options) {
        calls.push(options.name)
      },
      async dropTable(table) {
        calls.push(`drop:${table}`)
      }
    },
    logger: undefined
  })
  assert.ok((await umzug.pending()).some(({ name }) => name === '2026112701-create-family-invitation.js'))
  await umzug.up({ to: '2026112701-create-family-invitation.js' })
  assert.deepEqual(await umzug.up(), [])
  await umzug.down()
  assert.deepEqual(calls, ['create:family_invitation', 'uk_family_invitation_code_hash', 'idx_family_invitation_family_inviter_status', 'drop:family_invitation'])
})
