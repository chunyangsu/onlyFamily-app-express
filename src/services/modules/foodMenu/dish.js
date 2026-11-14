const { Op } = require('sequelize')
const { dishCategoryList, dishList } = require('@/models')

const dishService = {
  /**
   * 获取菜品列表
   */
  getDishList: async (query) => {
    const { name, categoryIds, familyId } = query

    let categoryIdArr = []
    if (categoryIds && categoryIds !== '') {
      categoryIdArr = categoryIds.split(',').map((id) => Number(id.trim()))
      // 去重
      categoryIdArr = [...new Set(categoryIdArr)]
    }
    console.log(categoryIdArr)

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

    // 5. 根据分类ID分组菜品
    const categories = categoryList.map((category) => {
      const categoryDishes = dishes.filter((dish) => dish.categoryId === category.id)

      return {
        categoryId: category.id,
        categoryName: category.name,
        // dishCount: categoryDishes.length,
        dishList: categoryDishes
      }
    })

    // 6. 搜索时只返回存在匹配菜品的分类
    // const resultCategories = name?.trim() ? categories.filter((category) => category.dishCount > 0) : categories
    const resultCategories = categories

    // 7. 返回结果
    const list = {
      total: resultCategories.reduce((total, category) => total + category.dishList.length, 0),
      list: resultCategories
    }
    // const list = await dishList.findAll()
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
