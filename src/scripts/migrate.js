require('module-alias/register')

const { Umzug, SequelizeStorage } = require('umzug')
const sequelize = require('@/config/database')

const umzug = new Umzug({
  migrations: {
    glob: 'src/migrations/*.js'
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize
  }),
  logger: console
})

const migrate = async () => {
  try {
    await sequelize.authenticate()

    console.log('数据库连接成功，开始执行迁移')

    await umzug.up()

    console.log('数据库迁移完成')
  } catch (error) {
    console.error('数据库迁移失败：', error)
    process.exitCode = 1
  } finally {
    await sequelize.close()
  }
}

migrate()
