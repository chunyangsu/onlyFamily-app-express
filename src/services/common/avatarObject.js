// 获取OSS读取客户端，使用后端STS临时凭证读取私有文件
const { getOssReadClient } = require('@/config/oss')

const invalidFile = (message) => {
  const error = new Error(message)
  error.status = 400
  throw error
}

/** 校验对象存在、大小和文件头；不能替代完整图片解码或内容安全审核。 */
async function validateAvatarObject(objectKey, mimeType) {
  const client = await getOssReadClient()
  try {
    const metadata = await client.head(objectKey)
    const size = Number(metadata.res.headers['content-length'])
    if (!Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024) invalidFile('头像文件大小必须在 1 字节到 5 MB 之间')
    const result = await client.get(objectKey, { headers: { Range: 'bytes=0-11' } })
    const bytes = result.content
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    const actualMime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : ''
    if (!actualMime || actualMime !== mimeType) invalidFile('头像文件格式不支持或与附件记录不一致')
  } catch (error) {
    if (error.code === 'NoSuchKey' || error.status === 404) invalidFile('头像文件不存在，请重新上传')
    throw error
  }
}

module.exports = { validateAvatarObject }
