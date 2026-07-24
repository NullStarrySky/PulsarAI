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
    - 文档和对整个应用代码的更好的索引化
    - 移动端适配
    - 实现更新器
    - 对sillytavern的批量迁移集成
  SandBox:
    - 在其他所有features中引入权限系统，收紧对全局对象的访问
  Conversation:
    - 实现子代理功能，利用SubAgentStep类型
    - 重生成优化：允许传入上一个消息来避免重复，或者允许选中并标注，来进行局部改写或者强调
    - 添加文档解析能力
    - 对底栏工具项的配置
    - 更偏向小说而非对话的模式
    - 允许模型向用户提问，实现相应的内置提问框
  Plugin:
    - 实现内置的记忆插件
    - 允许复制地址来进行条目之间的相互引用
    - 更完善的内置方法和更易用的条件编写
    - 更好的图数据库支持
  InteractiveDoc:
    - 允许内联变量
    - 允许块级任意组件，不限于可切换文本
    - 预执行的宏，不知道是否仍然有必要
  Backup:
    - 局域网同步
  Preset:
    - 更精细的默认配置
  UI:
    - 基于tauri-plugin-m3的导航栏颜色管理
    - 添加新容器的界面

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
    - 内置通知系统
    - 对开源的资源社区的集成
    - 部分内置资源
    - 网络代理
