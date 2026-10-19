import { Button, Modal, TextInput } from "../ui";
import { editorAssetUrl } from "../content/tree";
import type { ImageAsset } from "../content/types";

interface ImagePickerDialogProps {
	mode: "add" | "replace" | null;
	search: string;
	assets: ImageAsset[];
	total: number;
	loading: boolean;
	onClose: () => void;
	onSearchChange: (search: string) => void;
	onChoose: (asset: ImageAsset) => void;
}

export function ImagePickerDialog({ mode, search, assets, total, loading, onClose, onSearchChange, onChoose }: ImagePickerDialogProps) {
	return <Modal opened={mode !== null} onClose={onClose} title={mode === "replace" ? "更改图片" : "添加图片"} size="xl">
		<div className="image-picker">
			<TextInput data-autofocus placeholder="搜索已下载的图片" value={search} onChange={(event) => onSearchChange(event.currentTarget.value)} />
			<div className="image-picker-summary">{loading ? "正在读取图片…" : `${assets.length} / ${total} 张图片`}</div>
			<div className="image-picker-grid">{assets.map((image) => <Button variant="outline" color="gray" key={image.asset} onClick={() => onChoose(image)} title={image.file}><img src={editorAssetUrl(image.asset)} alt={image.file} loading="lazy" /><span>{image.file}</span></Button>)}</div>
			{!loading && !assets.length ? <p className="image-picker-empty">没有匹配的已下载图片。</p> : null}
		</div>
	</Modal>;
}
