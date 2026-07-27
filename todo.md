task:
  - 修复fix中的所有项，除了带有-skip后缀的项。
  - 不要删除完成项，在前面加上[x]即可，原因是修复不一定有效，我会之后手动审核并清理。
  - 如果前面是[ ]，表示我发现修复失败，需要重新修复。
  - 实现features中后缀为-working的项

fix:


feature:
  Migration:
    - plugin: Skill/MCP/plugin/preset/components/character
    - features: ImageGeneration/STT/TTS
  Global:
    - 实现features/live2d
    - 某种联机模式
    - 实现更新器
    - 对sillytavern的批量迁移集成
  Conversation:
    - 实现子代理功能，利用SubAgentStep类型
  Plugin:
    - /compact命令
    - 允许复制地址来进行条目之间的相互引用
  Preset:
    - 更精细的默认配置

todo:
  - 测试TTS和STT和ModelConnection和ImageGeneration这些

"同类产品可借鉴之处，不一定做":
  proma:
    - 将外部文件夹映射到资源
    - tavily联网搜索
    - 图标控制
    - 托盘图标

  airi:
    - live2d
    - 做得太烂了忍不住吐槽，select居然能输入和编辑……

  lobeHub:
    - 对开源的资源社区的集成
    - 部分内置资源
    - 网络代理
