const { Op } = require('sequelize')
const { dishCategoryList, dishList } = require('@/models')
const { getAttachmentList } = require('@/services/common/attachment')

const dishService = {
  /**
   * 获取菜品列表
   * @param {Object} query 查询条件，page 默认1，limit 默认4
   */
  getDishList: async (query = {}) => {
    const { name, page = 1, limit = 4 } = query
    const where = {}
    if (name?.trim()) {
      where.name = {
        [Op.like]: `%${name.trim()}%`
      }
    }

    const { count, rows: dishes } = await dishList.findAndCountAll({
      where,
      order: [
        ['createTime', 'DESC'],
        ['id', 'DESC']
      ],
      limit: limit,
      offset: (page - 1) * limit,
      raw: true
    })

    // 仅批量获取当前页菜品的主图 URL，避免重复查询附件或生成签名 URL
    const mainImageIds = [
      ...new Set(
        dishes
          .map((dish) => dish.mainImageId)
          .filter((id) => Number(id) > 0)
          .map(String)
      )
    ]
    const attachments = mainImageIds.length ? await getAttachmentList(mainImageIds) : []
    const mainImageUrlMap = new Map(attachments.map((attachment) => [String(attachment.id), attachment.url]))

    return {
      total: count,
      list: dishes.map((dish) => ({
        ...dish,
        mainImageUrl: mainImageUrlMap.get(String(dish.mainImageId)) ?? ''
      }))
    }
  },
  /**
   * 获取菜品列表(按菜品分类分组)
   */
  getDishGroupList: async (query) => {
    const { name, categoryIds, familyId } = query

    let categoryIdArr = []
    if (categoryIds && categoryIds !== '') {
      categoryIdArr = categoryIds.split(',').map((id) => Number(id.trim()))
      // 去重
      categoryIdArr = [...new Set(categoryIdArr)]
    }

    // 2. 构建分类查询条件
    const categoryWhere = {
      // familyId
    }
    if (categoryIdArr.length) {
      categoryWhere.id = {
        [Op.in]: categoryIdArr
      }
    }

    // 3. 构建菜品查询条件
    const dishWhere = {
      // familyId
    }
    if (name?.trim()) {
      dishWhere.name = {
        [Op.like]: `%${name.trim()}%`
      }
    }
    if (categoryIdArr.length) {
      dishWhere.categoryId = {
        [Op.in]: categoryIdArr
      }
    }
    // 4. 查询分类和菜品
    const [categoryList, dishes] = await Promise.all([
      dishCategoryList.findAll({
        where: categoryWhere,
        order: [['id', 'ASC']],
        raw: true
      }),

      dishList.findAll({
        where: dishWhere,
        order: [['id', 'DESC']],
        raw: true
      })
    ])

    // 批量获取主图 URL，避免逐个菜品查询附件或重复生成签名 URL
    const mainImageIds = [
      ...new Set(
        dishes
          .map((dish) => dish.mainImageId)
          .filter((id) => Number(id) > 0)
          .map(String)
      )
    ]
    const attachments = mainImageIds.length ? await getAttachmentList(mainImageIds) : []
    const mainImageUrlMap = new Map(attachments.map((attachment) => [String(attachment.id), attachment.url]))
    const dishesWithMainImageUrl = dishes.map((dish) => ({
      ...dish,
      mainImageUrl: mainImageUrlMap.get(String(dish.mainImageId)) ?? ''
    }))

    // 5. 根据分类ID分组菜品
    const categories = categoryList.map((category) => {
      const categoryDishes = dishesWithMainImageUrl.filter((dish) => dish.categoryId === category.id)

      return {
        categoryId: category.id,
        categoryName: category.name,
        dishList: categoryDishes
      }
    })

    // 6. 搜索时只返回存在匹配菜品的分类
    const resultCategories = categories

    // 7. 返回结果
    const list = {
      total: resultCategories.reduce((total, category) => total + category.dishList.length, 0),
      list: resultCategories
    }
    return list
  },
  /**
   * 创建菜品
   * @param {Object} formData 对象参数
   */
  createDish: async (formData) => {
    const newData = await dishList.create(formData)
    return newData
  }
}

module.exports = dishService
