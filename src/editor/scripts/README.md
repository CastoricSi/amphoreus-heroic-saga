# 崩坏：星穹铁道任务数据

任务工具通过 BWiki 的 MediaWiki API 获取原始 wikitext，并转换为适合编辑器使用的 JSON。索引固定包含以下三类任务：

- 开拓任务
- 开拓续闻
- 同行任务

## 增量更新

```powershell
npm run editor:mission-update
```

该命令会重新查询三类任务的完整索引，更新 `data/missions.json`，然后只获取：

- 新出现在索引中的任务页面；
- 索引中存在、但本地 `.wiki` 或 `.json` 文件缺失的任务页面。

已有页面沿用原本的本地文件路径，不会因为分类或名称变化产生重复副本。

## 完全重建

```powershell
npm run editor:mission-reset
```

该命令会重新生成完整索引，清理并重建 `data/missions/开拓任务`、`data/missions/开拓续闻` 和 `data/missions/同行任务`，然后逐页重新获取全部任务。`data/missions/剧本` 不会被清理或改动。

## 输出

- `data/missions.json`：任务类别 → 地点 → 系列任务 → 子任务。
- `data/missions/<任务类别>/<地点>/<系列任务>/*.wiki`：BWiki 源文本。
- 同目录下的 `*.json`：解析后的任务内容。
- `data/mission-index-report.json`：索引异常与统计。
- `data/mission-fetch-report.json`：本次页面获取与解析报告。

任务页面中的图片会在抓取时自动下载并写入资源清单，无需单独执行图片同步命令。

解析器的测试命令：

```powershell
npm run editor:test-parser
```
