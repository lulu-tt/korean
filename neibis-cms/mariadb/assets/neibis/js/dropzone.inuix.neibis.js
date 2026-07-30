// dropzone.inuix.default.js

/*
이 파일은 마크업팀 전용 UI 미리보기 세팅 파일입니다.
백엔드 개발시에는 이 파일을 복사 후 파일명을 dropzone.inuix.js 로 변경하고,
필요한 옵션을 수정한 뒤 사용해 주세요.

백엔드 개발팀에서 실수로 이 파일(dropzone.inuix.default.js)을 수정하지 않도록 유의해 주시고,
향후 UI 변경사항 발생시 dropzone.inuix.default.js이 변경되며,
dropzone.inuix.js 에도 동일하게 반영해야 합니다.
*/
var fileTmprList = new Array();
var fileKey = new Object();
var atchFileSnArr = new Array();
var rhwpModulePromise = null;
var attachMoreMenuSeq = 0;
var attachMoreMenuEventsBound = false;
var BODY_ACTION_MAX_BYTES = 15 * 1024 * 1024;
var BODY_ACTION_LIMIT_MESSAGE = "\uC2DC\uC2A4\uD15C \uAD00\uB9AC\uB97C \uC704\uD574 15MB\uAC00 \uB118\uB294 \uBB38\uC11C\uB294 \uBCF8\uBB38 \uBC18\uC601\uC774 \uC81C\uD55C\uB429\uB2C8\uB2E4. \uBBF8\uB9AC\uBCF4\uAE30 \uB610\uB294 \uB2E4\uC6B4\uB85C\uB4DC\uB85C \uD655\uC778\uD574 \uC8FC\uC138\uC694.";

const waitForUi = function () {
	return new Promise(function (resolve) {
		setTimeout(resolve, 0);
	});
};

const waitForPaint = function () {
	return new Promise(function (resolve) {
		if (typeof requestAnimationFrame !== "function") {
			setTimeout(resolve, 16);
			return;
		}

		requestAnimationFrame(function () {
			requestAnimationFrame(resolve);
		});
	});
};

const setApplyBodyStatus = function (buttonElement, message) {
	const btnArea = buttonElement?.closest(".btn-area");
	if (!btnArea) {
		return;
	}

	let statusNode = btnArea.querySelector(".hwpx-apply-status");
	if (!message) {
		if (statusNode) {
			statusNode.remove();
		}
		return;
	}

	if (!statusNode) {
		statusNode = document.createElement("span");
		statusNode.className = "hwpx-apply-status";
		btnArea.insertBefore(statusNode, buttonElement.nextSibling);
	}
	statusNode.textContent = message;
};

const showHwpxBodyLoading = function () {
	if (typeof showLoadingbar === "function") {
		showLoadingbar();
		return;
	}

	$(".loadingbar").removeClass("hide").addClass("show");
};

const hideHwpxBodyLoading = function () {
	if (typeof hideLoadingBar === "function") {
		hideLoadingBar();
		return;
	}

	$(".loadingbar").removeClass("show").addClass("hide");
};

const getContextRoot = function () {
	return window.CONTEXT_ROOT == "" ? "" : "/" + window.CONTEXT_ROOT;
};

const isDocActionEnabled = function ($uploaderItem) {
	return String($uploaderItem.data("enable-hwpx-body")).toLowerCase() === "true";
};

const getUploaderSiteId = function ($uploaderItem) {
	return String($uploaderItem.data("site-id") || "").trim();
};

const getUploaderMenuSn = function ($uploaderItem) {
	return String($uploaderItem.data("menu-sn") || "").trim();
};

const getBodyActionConfig = function ($uploaderItem) {
	return {
		targetId: String($uploaderItem?.data("body-target-id") || "pstCn").trim() || "pstCn",
		editorId: String($uploaderItem?.data("body-editor-id") || "ckeditor_pstCn").trim() || "ckeditor_pstCn",
		storeName: String($uploaderItem?.data("body-store-name") || "htmlCentralData").trim() || "htmlCentralData",
		siteId: getUploaderSiteId($uploaderItem),
		menuSn: getUploaderMenuSn($uploaderItem)
	};
};

const getFileExtension = function (fileName) {
	const safeName = typeof fileName === "string" ? fileName : "";
	const lastDotIndex = safeName.lastIndexOf(".");
	return lastDotIndex > -1 ? safeName.substring(lastDotIndex + 1).toLowerCase() : "";
};

const normalizeExtension = function (fileExtnNm) {
	return String(fileExtnNm || "").trim().replace(/^\./, "").toLowerCase();
};

const isHwpxExtension = function (fileExtnNm) {
	if (normalizeExtension(fileExtnNm) === "hwpx") {
		return true;
	}
	return getFileExtension(fileExtnNm) === "hwpx";
};

const isBodyInsertImageExtension = function (fileExtnNm) {
	const extnNm = normalizeExtension(fileExtnNm) || getFileExtension(fileExtnNm);
	return ["jpg", "jpeg", "png", "gif", "bmp", "jfif"].includes(extnNm);
};

const buildTempDownloadUrl = function (siteId, tmprAtchFileSn) {
	return `${getContextRoot()}/${siteId}/cmmn/tmp-download.do?tmprAtchFileSn=${encodeURIComponent(tmprAtchFileSn)}`;
};

const buildTempEditorImageUrl = function (siteId, menuSn, tmprAtchFileSn) {
	return `${getContextRoot()}/${siteId}/cmmn/tmp-editor-image.do?tmprAtchFileSn=${encodeURIComponent(tmprAtchFileSn)}&menuSn=${encodeURIComponent(menuSn || "0")}`;
};

const getUtf8ByteLength = function (value) {
	const text = String(value || "");
	if (window.TextEncoder) {
		return new TextEncoder().encode(text).length;
	}
	return unescape(encodeURIComponent(text)).length;
};

const assertBodyContentSizeLimit = function (html) {
	if (getUtf8ByteLength(html) <= BODY_ACTION_MAX_BYTES) {
		return;
	}

	const error = new Error("BODY_CONTENT_SIZE_LIMIT_EXCEEDED");
	error.bodyContentSizeLimitExceeded = true;
	throw error;
};

const getBodyActionErrorMessage = function (error, fallbackMessage) {
	if (error?.bodyContentSizeLimitExceeded) {
		return BODY_ACTION_LIMIT_MESSAGE;
	}
	return fallbackMessage;
};

const escapeHtml = function (value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
};

const ensureMeasureTextWidth = function () {
	if (typeof globalThis.measureTextWidth === "function") {
		return;
	}

	let ctx = null;
	let lastFont = "";

	globalThis.measureTextWidth = function (font, text) {
		const safeFont = typeof font === "string" && font.trim() ? font.trim() : "16px \"Malgun Gothic\", sans-serif";
		const safeText = typeof text === "string" ? text : `${text ?? ""}`;

		if (!ctx) {
			ctx = document.createElement("canvas").getContext("2d");
		}
		if (!ctx) {
			return safeText.length * 8;
		}
		if (lastFont !== safeFont) {
			ctx.font = safeFont;
			lastFont = safeFont;
		}

		const width = ctx.measureText(safeText).width;
		return Number.isFinite(width) && width > 0 ? width : safeText.length * 8;
	};
};

const loadRhwpModule = async function () {
	if (!rhwpModulePromise) {
		const assetBasePath = `${getContextRoot()}/assets/vendor/rhwp/0.7.11`;
		rhwpModulePromise = import(`${assetBasePath}/rhwp.js`).then(async function (module) {
			ensureMeasureTextWidth();
			await module.default(`${assetBasePath}/rhwp_bg.wasm`);
			module.init_panic_hook();
			return module;
		});
	}

	return rhwpModulePromise;
};

const normalizeImportedSvgMarkup = function (svgMarkup, pageIndex) {
	if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
		return svgMarkup;
	}

	const parser = new DOMParser();
	const parsedSvgDocument = parser.parseFromString(svgMarkup, "image/svg+xml");
	const svg = parsedSvgDocument.documentElement;

	if (!svg || svg.nodeName.toLowerCase() === "parsererror") {
		return svgMarkup;
	}

	const width = Number.parseFloat(String(svg.getAttribute("width") || "").replace(/[^\d.-]/g, ""));
	const height = Number.parseFloat(String(svg.getAttribute("height") || "").replace(/[^\d.-]/g, ""));
	if (!svg.getAttribute("viewBox") && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	}
	if (svg.getAttribute("viewBox")) {
		svg.removeAttribute("width");
		svg.removeAttribute("height");
	}

	svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
	svg.setAttribute("overflow", "visible");
	svg.setAttribute("focusable", "false");
	svg.setAttribute("data-page-index", String(pageIndex + 1));
	svg.style.display = "block";
	svg.style.width = "100%";
	svg.style.height = "auto";
	svg.style.overflow = "visible";

	return new XMLSerializer().serializeToString(svg);
};

const renderHwpxBodyHtml = async function (fileUrl) {
	const module = await loadRhwpModule();
	const response = await fetch(fileUrl, {
		cache: "no-store",
		credentials: "same-origin"
	});

	if (!response.ok) {
		throw new Error(`HWPX_FETCH_${response.status}`);
	}

	const buffer = new Uint8Array(await response.arrayBuffer());
	const doc = new module.HwpDocument(buffer);

	try {
		const pageCount = doc.pageCount();
		if (!pageCount || pageCount < 1) {
			throw new Error("HWPX_EMPTY_DOCUMENT");
		}

		let pagesHtml = "";
		for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
			if (pageIndex > 0) {
				await waitForUi();
			}
			const svgMarkup = normalizeImportedSvgMarkup(doc.renderPageSvg(pageIndex), pageIndex);
			pagesHtml += `<section class="hwpx-body-import__page" style="margin:0 0 24px;"><div class="hwpx-body-import__sheet" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;box-shadow:0 10px 24px rgba(15,23,42,.06);">${svgMarkup}</div></section>`;
		}

		return `<div class="hwpx-body-import" style="display:grid;gap:24px;">${pagesHtml}</div>`;
	} finally {
		doc.free();
	}
};

const getEditorBodyHtml = function (bodyConfig = {}) {
	const targetId = bodyConfig.targetId || "pstCn";
	const editorId = bodyConfig.editorId || "ckeditor_pstCn";
	const storeName = bodyConfig.storeName || "htmlCentralData";
	const ckeditorInstance = window.CKEDITOR?.instances?.[editorId];
	if (ckeditorInstance) {
		return ckeditorInstance.getData() || "";
	}

	if (window[storeName] && typeof window[storeName].html === "string") {
		return window[storeName].html;
	}

	if (storeName === "htmlCentralData" && typeof window.htmlCentralData !== "undefined" && typeof window.htmlCentralData.html === "string") {
		return window.htmlCentralData.html;
	}

	return $(`#${targetId}`).val() || "";
};

const isEditorBodyEmpty = function () {
	const currentHtml = getEditorBodyHtml();
	const plainText = $("<div>").html(currentHtml).text().replace(/\u00a0/g, " ").trim();
	return !plainText && !/<(img|svg|table|iframe|object|embed)\b/i.test(currentHtml || "");
};

const setEditorStores = function (html, bodyConfig = {}) {
	const targetId = bodyConfig.targetId || "pstCn";
	const storeName = bodyConfig.storeName || "htmlCentralData";

	if (storeName === "htmlCentralData" && typeof window.centralData !== "undefined" && typeof window.centralData.html === "string") {
		window.centralData.html = html;
	}

	if (window[storeName]) {
		window[storeName].html = html;
	} else if (storeName === "htmlCentralData" && typeof window.htmlCentralData !== "undefined") {
		window.htmlCentralData.html = html;
	}

	$(`#${targetId}`).val(html);
};

const syncEditorIframeBody = function (html, bodyConfig = {}) {
	const editorId = bodyConfig.editorId || "ckeditor_pstCn";
	const iframeIds = Array.from(new Set(["preview-iframe", `preview-iframe-${editorId}`]));
	iframeIds.forEach(function (iframeId) {
		const iframe = document.getElementById(iframeId);
		const iframeDocument = iframe?.contentDocument || iframe?.contentWindow?.document;
		const body = iframeDocument?.body;
		if (body && body.innerHTML !== html) {
			body.innerHTML = html;
		}
	});
};

const syncCkEditorBody = function (html, bodyConfig = {}) {
	try {
		const editorId = bodyConfig.editorId || "ckeditor_pstCn";
		if (editorId === "ckeditor_pstCn" && window.InuixEditor?.setData) {
			window.InuixEditor.setData(html);
			return;
		}

		const ckeditorInstance = window.CKEDITOR?.instances?.[editorId];
		if (ckeditorInstance?.setData && ckeditorInstance.getData() !== html) {
			ckeditorInstance.setData(html);
		}
	} catch (error) {
		console.warn("[hwpx-body-import] editor sync skipped", error);
	}
};

const syncCodeEditorBody = function (html, bodyConfig = {}) {
	try {
		if (bodyConfig.targetId && bodyConfig.targetId !== "pstCn") {
			return;
		}
		const codeEditor = typeof htmlEditor !== "undefined" ? htmlEditor : window.htmlEditor;
		if (codeEditor?.getValue && codeEditor?.setValue && codeEditor.getValue() !== html) {
			codeEditor.setValue(html);
		}
		codeEditor?.refresh?.();
	} catch (error) {
		console.warn("[hwpx-body-import] code editor sync skipped", error);
	}
};

const setEditorBodyHtml = async function (html, bodyConfig = {}) {
	setEditorStores(html, bodyConfig);
	syncEditorIframeBody(html, bodyConfig);
	await waitForPaint();

	syncCkEditorBody(html, bodyConfig);
	syncEditorIframeBody(html, bodyConfig);
	await waitForPaint();

	syncCodeEditorBody(html, bodyConfig);
	setEditorStores(html, bodyConfig);
	syncEditorIframeBody(html, bodyConfig);
	await waitForPaint();
};

const buildEditorImageHtml = function (imageUrl, fileName) {
	return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(fileName || "")}" />`;
};

const insertImageHtmlToEditor = async function (imageUrl, fileName, bodyConfig = {}) {
	const imageHtml = buildEditorImageHtml(imageUrl, fileName);
	const wrappedImageHtml = `<p>${imageHtml}</p>`;
	const editorId = bodyConfig.editorId || "ckeditor_pstCn";
	const ckeditorInstance = window.CKEDITOR?.instances?.[editorId];
	if (ckeditorInstance?.insertElement && window.CKEDITOR?.dom?.element?.createFromHtml) {
		try {
			const imageElement = window.CKEDITOR.dom.element.createFromHtml(imageHtml);
			ckeditorInstance.insertElement(imageElement);
			ckeditorInstance.fire?.("change");
			await waitForPaint();
			await setEditorBodyHtml(ckeditorInstance.getData() || "", bodyConfig);
			return;
		} catch (error) {
			console.warn("[body-image-insert] ckeditor insertElement skipped", error);
		}
	}

	const nextHtml = `${getEditorBodyHtml(bodyConfig) || ""}${wrappedImageHtml}`;
	await setEditorBodyHtml(nextHtml, bodyConfig);
};

window.validateBodyActionTargetsSizeLimit = function () {
	const configMap = new Map();
	$(".file-upload").each(function () {
		const $uploaderItem = $(this);
		if (!isDocActionEnabled($uploaderItem)) {
			return;
		}
		const bodyConfig = getBodyActionConfig($uploaderItem);
		configMap.set(`${bodyConfig.targetId}::${bodyConfig.editorId}::${bodyConfig.storeName}`, bodyConfig);
	});

	if (!configMap.size) {
		configMap.set("pstCn::ckeditor_pstCn::htmlCentralData", {
			targetId: "pstCn",
			editorId: "ckeditor_pstCn",
			storeName: "htmlCentralData"
		});
	}

	for (const bodyConfig of configMap.values()) {
		if (getUtf8ByteLength(getEditorBodyHtml(bodyConfig)) > BODY_ACTION_MAX_BYTES) {
			alert(BODY_ACTION_LIMIT_MESSAGE);
			return false;
		}
	}
	return true;
};

const applyHwpxBodyToEditor = async function (fileUrl, fileName, onApplyStart, bodyConfig = {}) {
	const applyHtml = async function () {
		if (typeof onApplyStart === "function") {
			onApplyStart();
		}
		await waitForUi();
		const startedAt = performance.now();
		const bodyHtml = await renderHwpxBodyHtml(fileUrl);
		assertBodyContentSizeLimit(bodyHtml);
		const renderedAt = performance.now();
		await waitForUi();
		await setEditorBodyHtml(bodyHtml, bodyConfig);
		console.debug("[hwpx-body-import] timing", {
			renderMs: Math.round(renderedAt - startedAt),
			editorApplyMs: Math.round(performance.now() - renderedAt),
			htmlBytes: bodyHtml.length
		});
	};

	return new Promise(function (resolve, reject) {
		Message.confirm({
			icon: "warning",
			title: "\uBCF8\uBB38 \uBC18\uC601",
			message: "\uC774 \uCCA8\uBD80\uD30C\uC77C \uBCF8\uBB38\uC744 \uB0B4\uC6A9 \uC601\uC5ED\uC5D0 \uBC18\uC601\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C? \uAE30\uC874 \uB0B4\uC6A9\uC740 \uB36E\uC5B4\uC368\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
		}, function (confirmed) {
			if (confirmed === false) {
				resolve(false);
				return;
			}
			applyHtml().then(resolve).catch(reject);
		});
	});

	/*
	return new Promise(function (resolve, reject) {
		Message.confirm({
			icon: "warning",
			title: "본문 반영",
			message: "이 첨부파일 본문을 내용 영역에 반영하시겠습니까? 기존 내용은 덮어써질 수 있습니다."
		}, function () {
			applyHtml().then(resolve).catch(reject);
		});
	});

	return new Promise(function (resolve, reject) {
		Message.confirm({
			icon: "warning",
			title: "본문 반영",
			message: "이 첨부파일 본문을 내용 영역에 반영하시겠습니까? 기존 내용은 덮어써질 수 있습니다."
		}, function () {
			applyHtml().then(resolve).catch(reject);
		});
	});
	*/
};

const ensureTextActionButton = function (buttonElement, labelText) {
	if (!buttonElement) {
		return buttonElement;
	}

	buttonElement.classList.add("btn-text");
	let labelNode = buttonElement.querySelector(".btn-label");
	if (!labelNode) {
		labelNode = document.createElement("span");
		labelNode.className = "btn-label";
		buttonElement.appendChild(labelNode);
	}
	labelNode.textContent = labelText;

	return buttonElement;
};

const createDownloadButton = function (downloadUrl) {
	const downloadButton = document.createElement("a");
	downloadButton.href = downloadUrl;
	downloadButton.target = "_blank";
	downloadButton.className = "btn btn-download";
	downloadButton.innerHTML = `<i class="ico ico-download-md"></i><span class="sr-only">다운로드</span>`;
	return ensureTextActionButton(downloadButton, "다운로드");
};

/*
/*
const createApplyBodyButton = function (downloadUrl, fileName) {
	const applyButton = document.createElement("button");
	applyButton.type = "button";
	applyButton.className = "btn btn-apply-body";
	applyButton.innerHTML = `<span class="sr-only">본문 반영</span>`;
	ensureTextActionButton(applyButton, "본문 반영");
	ensureTextActionButton(applyButton, "본문 반영");
	applyButton.onclick = async function () {
		if (applyButton.disabled) {
			return;
		}
		applyButton.disabled = true;
		ensureTextActionButton(applyButton, "반영 중");
		try {
			await applyHwpxBodyToEditor(downloadUrl, fileName);
			applyButton.disabled = false;
			ensureTextActionButton(applyButton, "본문 반영");
		} catch (error) {
			console.error("[hwpx-body-import] apply failed", error);
			alert("첨부 문서를 본문에 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.");
		}
	};
	return applyButton;
};

*/
const createApplyBodyButton = function (downloadUrl, fileName) {
	const applyButton = document.createElement("button");
	applyButton.type = "button";
	applyButton.className = "btn btn-apply-body";
	applyButton.innerHTML = `<span class="sr-only">\uBCF8\uBB38 \uBC18\uC601</span>`;
	ensureTextActionButton(applyButton, "\uBCF8\uBB38 \uBC18\uC601");
	applyButton.onclick = function () {
		if (applyButton.disabled) {
			return;
		}

		let started = false;
		const markStarted = function () {
			started = true;
			applyButton.disabled = true;
			ensureTextActionButton(applyButton, "\uBC18\uC601 \uC911");
			showHwpxBodyLoading();
		};

		applyHwpxBodyToEditor(downloadUrl, fileName, markStarted).catch(function (error) {
			console.error("[hwpx-body-import] apply failed", error);
			alert(getBodyActionErrorMessage(error, "\uCCA8\uBD80 \uBB38\uC11C\uB97C \uBCF8\uBB38\uC5D0 \uBC18\uC601\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."));
		}).finally(function () {
			if (!started) {
				return;
			}
			applyButton.disabled = false;
			ensureTextActionButton(applyButton, "\uBCF8\uBB38 \uBC18\uC601");
			hideHwpxBodyLoading();
		});
	};
	return applyButton;
};

const getAttachMoreMenu = function (toggleButton) {
	const menuId = toggleButton?.getAttribute("aria-controls");
	return menuId ? document.getElementById(menuId) : null;
};

const closeAttachMoreMenus = function (exceptMenu) {
	document.querySelectorAll(".attach-more-menu:not([hidden])").forEach(function (menu) {
		if (exceptMenu && menu === exceptMenu) {
			return;
		}

		menu.hidden = true;
		if (menu.id) {
			const toggleButton = document.querySelector(`.btn-more-attach[aria-controls="${menu.id}"]`);
			if (toggleButton) {
				toggleButton.setAttribute("aria-expanded", "false");
			}
		}
	});
};

const bindAttachMoreMenuEvents = function () {
	if (attachMoreMenuEventsBound) {
		return;
	}
	attachMoreMenuEventsBound = true;

	document.addEventListener("click", function (event) {
		const target = event.target;
		if (target?.closest?.(".btn-more-attach") || target?.closest?.(".attach-more-menu")) {
			return;
		}
		closeAttachMoreMenus();
	});

	document.addEventListener("keydown", function (event) {
		if (event.key !== "Escape") {
			return;
		}

		const openToggleButton = document.querySelector('.btn-more-attach[aria-expanded="true"]');
		closeAttachMoreMenus();
		openToggleButton?.focus?.();
	});
};

const createMoreAttachButton = function (menuId) {
	const moreButton = document.createElement("button");
	moreButton.type = "button";
	moreButton.className = "btn btn-more-attach";
	moreButton.setAttribute("aria-expanded", "false");
	moreButton.setAttribute("aria-controls", menuId);
	moreButton.setAttribute("aria-haspopup", "menu");
	moreButton.title = "\uCCA8\uBD80\uD30C\uC77C \uB354\uBCF4\uAE30";
	moreButton.innerHTML = [
		'<i class="ico ico-more-vert-md" aria-hidden="true">',
		'<svg width="16" height="16" viewBox="0 0 16 16" fill="none">',
		'<circle cx="8" cy="3.2" r="1.4" fill="currentColor"/>',
		'<circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
		'<circle cx="8" cy="12.8" r="1.4" fill="currentColor"/>',
		"</svg>",
		"</i>",
		'<span class="sr-only">\uCCA8\uBD80\uD30C\uC77C \uB354\uBCF4\uAE30</span>'
	].join("");

	moreButton.onclick = function (event) {
		event.preventDefault();
		event.stopPropagation();

		const menu = getAttachMoreMenu(moreButton);
		if (!menu) {
			return;
		}

		const isOpen = moreButton.getAttribute("aria-expanded") === "true";
		closeAttachMoreMenus(isOpen ? null : menu);
		menu.hidden = isOpen;
		moreButton.setAttribute("aria-expanded", isOpen ? "false" : "true");
	};

	return moreButton;
};

const createApplyBodyMenu = function (menuId) {
	const menu = document.createElement("div");
	menu.className = "attach-more-menu";
	menu.id = menuId;
	menu.setAttribute("role", "menu");
	menu.hidden = true;

	const applyItem = document.createElement("button");
	applyItem.type = "button";
	applyItem.className = "attach-more-menu__item";
	applyItem.setAttribute("role", "menuitem");
	applyItem.setAttribute("data-action", "apply-hwpx-body");
	applyItem.innerHTML = [
		'<i class="ico ico-import-gray-sm" aria-hidden="true">',
		'<svg width="14" height="14" viewBox="0 0 14 14" fill="none">',
		'<path d="M2.5 7h7.5M7.5 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
		'<path d="M11.5 2v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
		"</svg>",
		"</i>",
		"<span>\uBCF8\uBB38 \uBC18\uC601</span>"
	].join("");

	menu.appendChild(applyItem);

	const imageItem = document.createElement("button");
	imageItem.type = "button";
	imageItem.className = "attach-more-menu__item";
	imageItem.setAttribute("role", "menuitem");
	imageItem.setAttribute("data-action", "insert-body-image");
	imageItem.innerHTML = [
		'<i class="ico ico-image-insert-sm" aria-hidden="true">',
		'<svg width="14" height="14" viewBox="0 0 14 14" fill="none">',
		'<rect x="2" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>',
		'<path d="M4 9.7 6.1 7.5l1.6 1.6 1.3-1.4 1 1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
		'<circle cx="9.3" cy="5" r=".8" fill="currentColor"/>',
		"</svg>",
		"</i>",
		"<span>\uBCF8\uBB38\uC5D0 \uC774\uBBF8\uC9C0 \uCD94\uAC00</span>"
	].join("");

	menu.appendChild(imageItem);
	return menu;
};

const createDownloadMenuItem = function (downloadUrl) {
	const downloadItem = document.createElement("a");
	downloadItem.href = downloadUrl;
	downloadItem.target = "_blank";
	downloadItem.className = "attach-more-menu__item";
	downloadItem.setAttribute("role", "menuitem");
	downloadItem.setAttribute("data-action", "download-file");
	downloadItem.innerHTML = [
		'<i class="ico ico-download-menu-sm" aria-hidden="true">',
		'<svg width="14" height="14" viewBox="0 0 14 14" fill="none">',
		'<path d="M7 2v6.2M4.5 5.8 7 8.3l2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
		'<path d="M3 11.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
		"</svg>",
		"</i>",
		"<span>\uB2E4\uC6B4\uB85C\uB4DC</span>"
	].join("");
	return downloadItem;
};

const ensureDownloadMenuItem = function (menu, downloadUrl) {
	let downloadItem = menu.querySelector('[data-action="download-file"]');
	if (!downloadUrl) {
		downloadItem?.remove();
		return;
	}

	if (!downloadItem) {
		downloadItem = createDownloadMenuItem(downloadUrl);
		menu.appendChild(downloadItem);
	} else {
		downloadItem.href = downloadUrl;
		downloadItem.target = "_blank";
	}
};

const bindApplyBodyMenuAction = function (menuItem, toggleButton, downloadUrl, fileName, bodyConfig = {}) {
	menuItem.onclick = function (event) {
		event.preventDefault();
		event.stopPropagation();

		if (menuItem.disabled || toggleButton.disabled) {
			return;
		}

		const menu = getAttachMoreMenu(toggleButton);
		if (menu) {
			menu.hidden = true;
			toggleButton.setAttribute("aria-expanded", "false");
		}

		let started = false;
		const markStarted = function () {
			started = true;
			menuItem.disabled = true;
			toggleButton.disabled = true;
			showHwpxBodyLoading();
		};

		applyHwpxBodyToEditor(downloadUrl, fileName, markStarted, bodyConfig).catch(function (error) {
			console.error("[hwpx-body-import] apply failed", error);
			alert(getBodyActionErrorMessage(error, "\uCCA8\uBD80 \uBB38\uC11C\uB97C \uBCF8\uBB38\uC5D0 \uBC18\uC601\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."));
		}).finally(function () {
			if (!started) {
				return;
			}
			menuItem.disabled = false;
			toggleButton.disabled = false;
			hideHwpxBodyLoading();
		});
	};
};

const requestEditorImageUrl = async function (requestUrl) {
	const response = await fetch(requestUrl, {
		method: "POST",
		cache: "no-store",
		credentials: "same-origin",
		headers: {
			"Accept": "application/json"
		}
	});
	const data = await response.json().catch(function () {
		return null;
	});
	if (!response.ok || !data || Number(data.uploaded) !== 1 || !data.url) {
		throw new Error(`IMAGE_INSERT_${response.status}`);
	}
	return data.url;
};

const bindInsertImageMenuAction = function (menuItem, toggleButton, options, bodyConfig) {
	menuItem.onclick = function (event) {
		event.preventDefault();
		event.stopPropagation();

		if (menuItem.disabled || toggleButton.disabled) {
			return;
		}

		const menu = getAttachMoreMenu(toggleButton);
		if (menu) {
			menu.hidden = true;
			toggleButton.setAttribute("aria-expanded", "false");
		}

		menuItem.disabled = true;
		toggleButton.disabled = true;
		showHwpxBodyLoading();

		Promise.resolve()
			.then(function () {
				if (options.tempEditorImageUrl) {
					return requestEditorImageUrl(options.tempEditorImageUrl);
				}
				if (options.editorImageUrl) {
					return requestEditorImageUrl(options.editorImageUrl);
				}
				throw new Error("IMAGE_INSERT_URL_EMPTY");
			})
			.then(function (imageUrl) {
				return insertImageHtmlToEditor(imageUrl, options.fileName, bodyConfig);
			})
			.catch(function (error) {
				console.error("[body-image-insert] apply failed", error);
				alert("\uC774\uBBF8\uC9C0\uB97C \uBCF8\uBB38\uC5D0 \uCD94\uAC00\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
			})
			.finally(function () {
				menuItem.disabled = false;
				toggleButton.disabled = false;
				hideHwpxBodyLoading();
			});
	};
};

const ensureExternalViewerButton = function (btnArea, deleteButton, viewerUrl) {
	if (!btnArea || !deleteButton || !viewerUrl) {
		return;
	}
	let viewerButton = btnArea.querySelector(".btn-preview");
	if (!viewerButton) {
		viewerButton = document.createElement("a");
		viewerButton.className = "btn btn-preview";
		viewerButton.target = "_blank";
		viewerButton.rel = "noopener noreferrer";
		viewerButton.title = "미리보기";
		viewerButton.innerHTML = `<i class="ico ico-preview-md" aria-hidden="true"></i><span class="sr-only">미리보기</span>`;
		btnArea.insertBefore(viewerButton, deleteButton);
	}
	viewerButton.href = viewerUrl;
};

const enhancePreviewActions = function ($uploaderItem, previewElement, options) {
	if (!previewElement) {
		return;
	}

	options = options || {};
	const btnArea = previewElement.querySelector(".btn-area");
	const deleteButton = btnArea?.querySelector(".btn-delete");
	if (!btnArea || !deleteButton) {
		return;
	}

	if (options.viewerUrl) {
		ensureExternalViewerButton(btnArea, deleteButton, options.viewerUrl);
		$uploaderItem.addClass("has-viewer-action");
	}
	if (!isDocActionEnabled($uploaderItem)) {
		return;
	}

	$uploaderItem.addClass("has-doc-actions");

	/*
	let downloadButton = btnArea.querySelector(".btn-download");
	if (options.showDownload === false) {
		if (downloadButton) {
			downloadButton.remove();
			downloadButton = null;
		}
	} else if (!downloadButton && options.downloadUrl) {
		downloadButton = createDownloadButton(options.downloadUrl);
		btnArea.insertBefore(downloadButton, deleteButton);
	} else if (downloadButton && options.downloadUrl) {
		downloadButton.href = options.downloadUrl;
		downloadButton.target = "_blank";
		ensureTextActionButton(downloadButton, "다운로드");
	}
	*/

	btnArea.querySelectorAll(".btn-apply-body").forEach(function (applyButton) {
		applyButton.remove();
	});

	const bodyImportUrl = options.bodyImportUrl || options.downloadUrl;
	const hasHwpxBodyAction = isHwpxExtension(options.ext) && bodyImportUrl;
	const hasImageInsertAction = isBodyInsertImageExtension(options.ext) && (options.tempEditorImageUrl || options.editorImageUrl);
	if (hasHwpxBodyAction || hasImageInsertAction) {
		bindAttachMoreMenuEvents();

		const menuId = btnArea.querySelector(".attach-more-menu")?.id || `attach-more-${++attachMoreMenuSeq}`;
		let moreButton = btnArea.querySelector(".btn-more-attach");
		if (!moreButton) {
			moreButton = createMoreAttachButton(menuId);
		} else {
			moreButton.setAttribute("aria-controls", menuId);
			moreButton.setAttribute("aria-haspopup", "menu");
		}
		moreButton.setAttribute("aria-expanded", "false");

		let moreMenu = document.getElementById(menuId);
		if (!moreMenu || !btnArea.contains(moreMenu)) {
			moreMenu = createApplyBodyMenu(menuId);
		}
		moreMenu.id = menuId;
		moreMenu.hidden = true;

		const bodyConfig = getBodyActionConfig($uploaderItem);
		const applyItem = moreMenu.querySelector('[data-action="apply-hwpx-body"]');
		if (applyItem && hasHwpxBodyAction) {
			applyItem.hidden = false;
			applyItem.style.display = "";
			bindApplyBodyMenuAction(applyItem, moreButton, bodyImportUrl, options.fileName, bodyConfig);
		} else if (applyItem) {
			applyItem.hidden = true;
			applyItem.style.display = "none";
		}

		const imageItem = moreMenu.querySelector('[data-action="insert-body-image"]');
		if (imageItem && hasImageInsertAction) {
			imageItem.hidden = false;
			imageItem.style.display = "";
			bindInsertImageMenuAction(imageItem, moreButton, options, bodyConfig);
		} else if (imageItem) {
			imageItem.hidden = true;
			imageItem.style.display = "none";
		}
		ensureDownloadMenuItem(moreMenu, options.moveDownloadToMenu ? options.downloadUrl : null);

		if (options.moveDownloadToMenu) {
			btnArea.querySelector(".btn-download")?.remove();
		}

		btnArea.insertBefore(moreButton, deleteButton);
		btnArea.appendChild(moreMenu);
	}
};

const fileUploader = (customConfig = {}) => {
	$(function () {
		let fileKey = 0; // 고유 키 값 카운터

		$(".file-upload").each(function () {
			const $uploaderItem = $(this);

			let atchFileTypeCd =  $(this).data("file-type"); // 확장자 제한을  위한  첨부파일 타입코드

			const isMultiple = $uploaderItem.hasClass("file-upload-multiple");

			// Dropzone 인스턴스가 이미 초기화된 요소인지 확인
			if ($uploaderItem.hasClass("dz-element")) {
				return;
			}
			
			var contextRoot = getContextRoot();
			
			// 드랍존 업로더 전역 공통 설정
			const uiCommonConfig = {
				// [개발팀] 설정
				url: contextRoot+"/neibis-api/v1/core/upload?action=post", // 파일을 업로드할 서버 주소 url.
				method: "post", // 기본 post로 request 감. put으로도 할수있음
				headers: {
					// 요청 보낼때 헤더 설정
					Authorization: "Bearer " + $("#_setToken").val() // jwt
				},
				autoProcessQueue: true, // 자동으로 보내기. true : 파일 업로드 되자마자 서버로 요청, false : 서버에는 올라가지 않은 상태. 따로 this.processQueue() 호출시 전송
				paramName: "file",
				autoQueue: true, // 드래그 드랍 후 바로 서버로 전송
				maxFilesize: getMaxFileSize(), // 최대 업로드용량 : 50MB
				timeout: 500000, // 커넥션 타임아웃 설정 -> 데이터가 클 경우 꼭 넉넉히 설정해주자
				acceptedFiles: getAcceptedFiles(atchFileTypeCd), //허용확장자

				// [마크업팀] UI 관련 설정
				thumbnailWidth: 40,
				thumbnailHeight: 40,
				addRemoveLinks: false,
				previewTemplate: createPreviewTemplate(),
				previewsContainer: $uploaderItem.find(".preview-area")[0],
				modifyTemplate: modifyPreviewTemplate(),
			    renameFile: function (file) {
        			  // 파일 확장자 추출
    				const extension = file.name.lastIndexOf('.') !== -1 ? file.name.substring(file.name.lastIndexOf('.')) : '';
    				// 확장자를 제외한 파일 이름 추출
    				const baseName = file.name.slice(0, file.name.lastIndexOf('.'));
    				// 파일 이름이 100자를 초과하는 경우, 100자 - 확장자 길이만큼만 잘라서 반환
    				return baseName.length > 100 - extension.length ? baseName.slice(0, 100 - extension.length) + extension : file.name;
    			},
				init: function () {
					// 업로드 진행률 표시 바
					this.on("uploadprogress", function (file, progress) {
						let progressTrack = file.previewElement.querySelector(".progress-track");
						let progressBar = file.previewElement.querySelector(".progress-bar");
						progressBar.style.width = progress + "%";

						// 진행률이 100%이면 프로그레스 바 숨김
						if (progress === 100) {
							progressTrack.style.display = "none";
						}
					});

					/*수정 모두 개발 */
					if($uploaderItem.find(".fileList").length > 0){
						addFileInstance(this);
					}
					/*수정 모두 개발 */

					// 파일 추가시
					this.on("addedfile", function (file) {

							// 단일 업로더 하나의 파일만 업로드
							if (!isMultiple && this.files.length > 1) {
							//fileTmprList 검증
							let removeBtn =	this.files[0].previewElement.querySelector(".btn-delete")
							let $btnElement =	$(removeBtn);
							let tmpSn =	$btnElement.data('tmpr-file-sn');

							fileTmprList.forEach((val,idx) => {
								if(val.tmprAtchFileSn == tmpSn){
									fileTmprList.splice(idx,1);
								}
							});

							//파일영역삭제
							this.removeFile(this.files[0]);


						}

						if (isMultiple && this.files.length > 1) {
							// 다중 업로더 파일 추가시 전체삭제 버튼 보이기
							$uploaderItem.find(".btn-all-delete").show();
						}

						const previewElement = $(this.options.previewTemplate.trim())[0];
						file.previewElement = previewElement;

						// Update file name and size
						const fileInfo = file.previewElement.querySelector(".info");
						//fileInfo.querySelector(".name").textContent = file.name;
						fileInfo.querySelector(".name").textContent = file.upload.filename;
						fileInfo.querySelector(".size").textContent = (file.size / 1024).toFixed(2) + " KB";

						// 파일 이미지 썸네일 노출
						file.previewElement.querySelector("img").src = URL.createObjectURL(file);

						const $previewContainer = $uploaderItem.find(".preview-area");
						$previewContainer.append(file.previewElement);

						// 각 파일에 고유한 키 값 부여
						//file.key = fileKey++;

						// 고유한 키를 data-file-key 속성에 추가
						//file.previewElement.querySelector(".btn-delete").setAttribute("data-file-key", file.key);

						// [개발팀] 삭제 버튼 클릭시 로직
						file.previewElement.querySelector(".btn-delete").onclick = function () {
						var tmpSn =	$(this).data("tmpr-file-sn");

						fileTmprList.forEach((val,idx) => {
							if(val.tmprAtchFileSn == tmpSn){
								fileTmprList.splice(idx,1);
							}
						});

						dzInstance.removeFile(file);

										if (!isMultiple) {
											// 단일 파일 삭제 버튼 클릭 시 .upload-area 표출
											$uploaderItem.find(".upload-area").show();
										}
						};

						// 비어있는 name, size를 가진 노드 삭제
						const emptyNodes = $uploaderItem.find(".file-item").filter(function () {
							const name = $(this).find(".name").text().trim();
							const size = $(this).find(".size").text().trim();
							return !name && !size;
						});
						if (emptyNodes.length) {
							emptyNodes.remove();
						}
					});

					// 파일 선택 이벤트 핸들러 추가
					const fileInputElement = $uploaderItem.find(".btn-file")[0];
					if (fileInputElement) {
						fileInputElement.addEventListener("click", () => {
							dzInstance.hiddenFileInput.click();
						});
					}

					this.on("removedfile", function (file) {
						// 모든 파일이 삭제되었으면 전체삭제 버튼 숨기기
						if (this.files.length === 0) {
							$uploaderItem.find(".btn-all-delete").hide();
						}

						if(typeof file.seq !== "undefined"){
							atchFileSnArr.push(file.seq);
						}

						// 예제 코드를 추가하세요.
					});

					this.on("sending", function (file, xhr, formData) {
						console.log("보내는 중: ", formData);
						// 예제 코드를 추가하세요.
					});

					this.on("success", function (file, responseText) {
						console.log("업로드 성공: ", file);

						var obj = JSON.parse(JSON.stringify(responseText.data));

						$.each(this.element.querySelectorAll("input"),function(i,v){
							obj[v.name] = v.value;
						});

						fileTmprList.push(obj);

						file.previewElement.querySelector(".btn-delete").setAttribute("data-tmpr-file-sn", obj.tmprAtchFileSn);
						if (isDocActionEnabled($uploaderItem)) {
							const uploaderSiteId = getUploaderSiteId($uploaderItem);
							enhancePreviewActions($uploaderItem, file.previewElement, {
								downloadUrl: buildTempDownloadUrl(uploaderSiteId, obj.tmprAtchFileSn),
								tempEditorImageUrl: buildTempEditorImageUrl(uploaderSiteId, getUploaderMenuSn($uploaderItem), obj.tmprAtchFileSn),
								fileName: obj.atchFileNm || file.upload?.filename || file.name,
								ext: obj.atchFileExtnNm || file.name,
								showDownload: false
							});
						}

					});

					this.on("maxfilesreached", function(file) {
					  console.log("maxfilesreached ");
					});

//최대파일초과
					this.on("maxfilesexceeded", function(file) {
					  alert("더이상 파일을 업로드 할 수 없어요.");
					});

					this.on("error", function (file, errorMessage) {
						let fileIndex = this.files.length-1;
						//허용용량이 초과되었을때
						if((file.size / 1024 / 1024) > this.options.maxFilesize) {
							this.removeFile(this.files[fileIndex]);
     						alert(this.options.maxFilesize+"MB 이하의 파일만 업로드해주세요.");
							return false;			//용량초과 검증 시 return false 안하면 밑에 removefile 시 오류 발생함

						}else if(errorMessage == "You can't upload files of this type."){ //확장자로 인한 에러를 판단할  다른 상태값 등의 데이터가없어서 임시검증

							alert("올바른 확장자의 파일을  업로드해주세요.\r\n("+this.options.acceptedFiles+")");
						}else if(errorMessage == "You can not upload any more files."){
							alert("더이상 파일을 업로드 할 수 없어요.");
						}else{
						 alert(errorMessage);
						}

						//파일영역삭제
						this.removeFile(this.files[fileIndex]);


					});
				}
			};

					const addFileInstance = function(_this){
					const $dropzoneArea = _this;
					let atchInfo = $uploaderItem.find(".fileList");

					$.each(atchInfo,function(i,v){
						let mockFile = { name: $(this).data("atch-file-nm")
										, size:  $(this).data("atch-file-size")
										,seq: $(this).data("atch-file-sn")
										,url: $(this).data("atch-download-url")
										,viewerUrl: $(this).data("atch-viewer-url")
										,bodyImportUrl: $(this).data("atch-body-import-url")
										,imgUrl: $(this).data("img-url")
										,editorImageUrl: $(this).data("editor-image-url")
										,ext: $(this).data("atch-file-extn-nm")
										};

						$dropzoneArea.files.push(mockFile);

							const previewElement = $($dropzoneArea.options.modifyTemplate.trim())[0];
							mockFile.previewElement = previewElement;

							mockFile.previewElement.querySelector(".progress-track").style.display = "none";
							const fileInfo = mockFile.previewElement.querySelector(".info");
							fileInfo.querySelector(".name").textContent = mockFile.name;
							fileInfo.querySelector(".size").textContent = (mockFile.size / 1024).toFixed(2) + " KB";

							mockFile.previewElement.querySelector(".btn-delete").setAttribute("data-atch-file-sn", mockFile.seq);

							mockFile.previewElement.querySelector(".btn-download").href = mockFile.url;
							enhancePreviewActions($uploaderItem, mockFile.previewElement, {
								downloadUrl: mockFile.url,
								viewerUrl: mockFile.viewerUrl,
								bodyImportUrl: mockFile.bodyImportUrl,
								editorImageUrl: mockFile.editorImageUrl,
								fileName: mockFile.name,
								ext: mockFile.ext || mockFile.name,
								moveDownloadToMenu: true
							});

							// 파일 이미지 썸네일 노출
							if(typeof $(this).data("img-url") !== "undefined"){
								mockFile.previewElement.querySelector("img").src = $(this).data("img-url");
							}

							const $previewContainer = $uploaderItem.find(".preview-area");
							$previewContainer.append(mockFile.previewElement);

							mockFile.previewElement.querySelector(".btn-delete").onclick = function () {

							dzInstance.removeFile(mockFile);

											if (!isMultiple) {
												// 단일 파일 삭제 버튼 클릭 시 .upload-area 표출
												$uploaderItem.find(".upload-area").show();
											}
							};
						});
				}

			// 단일업로더 설정
			const singleUploadConfig = {
				uploadMultiple: false,
				maxFiles: 1,
				parallelUploads: 1,
				chunking: true,
				chunkSize: 500000000
			};

			// 다중업로더 설정
			const multipleUploadConfig = {
				//uploadMultiple: true,
				parallelChunkUploads: true, // 동시파일업로드 수(이걸 지정한 수 만큼 여러파일을 한번에 넘긴다.)
				maxFiles: 10,
				parallelUploads: 1,
				accept: function (file, done) {  //maxfile 검증
					if ((this.options.maxFiles) && (this.files.length) > this.options.maxFiles)
					{
						done(this.options.dictMaxFilesExceeded);
					}else{
						done();	
					}
				},
				chunking: false
			};

			// 업로더 설정 통합
			const uploadConfig = {
				...uiCommonConfig,
				...customConfig, // 개발 설정
				...(isMultiple ? multipleUploadConfig : singleUploadConfig)
			};

			//  UI 템플릿 적용
			const filesizeText = uiCommonConfig.maxFilesize;
			if (!$uploaderItem.find(".upload-area").length) {
				$uploaderItem.append(createUploadAreaTemplate(isMultiple, filesizeText));
			}
			
			//전체삭제 여부 
			if($uploaderItem.find(".fileList").length > 1 
					&& isMultiple){
				$uploaderItem.find(".btn-all-delete").show();
			}

			// 업로더 영역 너비 측정 후 레이아웃 설정
			const resizeHandler = () => {
				if (isMultiple && $uploaderItem.width() >= 700) {
					$uploaderItem.addClass("col2");
				} else {
					$uploaderItem.removeClass("col2");
				}
			};
			resizeHandler();
			$(window).on("resize", resizeHandler);

			// 미리보기 영역 생성
			if ($uploaderItem.find(".preview-area").length === 0) {
				$uploaderItem.append('<div class="preview-area"></div>');
			}

			const dzInstance = new Dropzone($uploaderItem[0], uploadConfig);

			// 전체삭제
			if (isMultiple) {
			
				$uploaderItem.on("click", ".btn-all-delete", function () {
			        // jQuery 선택자 캐싱
			        const deleteButtons = $uploaderItem.find(".preview-area .btn-delete");
			        
			        const toRemoveIndexes = [];
			        
			        deleteButtons.each(function() {
			            const oriFileSn = $(this).data("atch-file-sn");
			            const tmpSn = $(this).data("tmpr-file-sn");
			            
			            if (typeof oriFileSn !== "undefined") {
			                atchFileSnArr.push(oriFileSn);
			            }
			            
			            if (typeof tmpSn !== "undefined") {
			                // 적합한 인덱스를 찾아 배열에 추가
			                const index = fileTmprList.findIndex(val => val.tmprAtchFileSn === tmpSn);
			                if (index !== -1) {
			                    toRemoveIndexes.push(index);
			                }
			            }
			        });
			
			        // 한 번에 모든 필요한 항목 삭제
			        toRemoveIndexes.sort((a, b) => b - a); // 내림차순 정렬
			        for (const index of toRemoveIndexes) {
			            fileTmprList.splice(index, 1);
			        }
			
			        // 모든 파일 제거
			        dzInstance.removeAllFiles(true);
			    });
			}


		});

	});
};

function createPreviewTemplate() {
	return `
	<div class="file-item">
		<div class="preview">
			<img src="${NEIBIS_ASSET_PATH}/images/img-file@2x.png" onerror="this.src='${NEIBIS_ASSET_PATH}/images/img-file@2x.png'" alt="" class="preview-img" />
		</div>
		<div class="info">
			<p class="name"></p>
			<p class="size"></p>
		</div>
		<div class="btn-area">
			<button type="button" class="btn btn-delete">
				<i class="ico ico-delete-md"></i>
				<span class="sr-only">삭제</span>
			</button>
		</div>
		<div class="progress-track">
			<div class="progress-bar" style="width: 50%;"></div>
		</div>
	</div>
`;
}

function modifyPreviewTemplate() {
	return `
	<div class="file-item">
		<div class="preview">
			<img src="${NEIBIS_ASSET_PATH}/images/img-file@2x.png" onerror="this.src='${NEIBIS_ASSET_PATH}/images/img-file@2x.png'" alt="" class="preview-img" />
		</div>
		<div class="info">
			<p class="name"></p>
			<p class="size"></p>
		</div>
		<div class="btn-area">
			<a href="#;" class="btn btn-download" target="_blank">
				<i class="ico ico-download-md"></i> <span class="sr-only">다운로드</span>
			</a>
			<button type="button" class="btn btn-delete">
				<i class="ico ico-delete-md"></i>
				<span class="sr-only">삭제</span>
			</button>
		</div>
		<div class="progress-track">
			<div class="progress-bar" style="width: 50%;"></div>
		</div>
	</div>
`;
}

const createUploadAreaTemplate = (isMultiple, filesizeText) => {
	return `
	<div class="upload-area">
		<div class="guide-text">
			<p>
				${isMultiple ? "여러개 파일을" : "파일을"} 마우스로 끌어오거나, <br class="d-down-sm" />
				<button type="button" class="btn btn-file">파일을 선택</button>해주세요.
			</p>
			<span>최대 ${filesizeText}MB 이하의 파일을 등록할 수 있습니다.</span>
		</div>
	</div>
	${
		isMultiple
			? `
		<button type="button" class="btn btn-xs btn-gray btn-all-delete">
			<i class="ico ico-trash-white-sm"></i>
			<span>전체삭제</span>
		</button>`
			: ""
	}
`;
};

/*
	허용확장자 구하는 함수
	A (All)		 : 가능한모든첨부파일 (.gif,.bmp,.jpg,.png,.jpeg,.svg,.mp4,.wmv,.avi,.hwp,.doc,.docx,.xls,.xlsx,.pptx,.jpg,.jpeg,.png,.zip,.pdf,.txt,.jfif)
	I (Images)   : 이미지 (.gif,.bmp,.jpg,.png,.jpeg,.jfif,.svg)
	D (Document) : 문서 (.hwp,.doc,.docx,.xls,.xlsx,.pptx,.jpg,.jpeg,.png,.zip,.pdf,.txt,.jfif)
	M (Movie)    : 동영상 (.mp4,.wmv,.avi)
*/
function getAcceptedFiles(atchFileTypeCd){
	var accepted_files = window.ACCEPTED_FILES  ?  window.ACCEPTED_FILES : ".gif,.bmp,.jpg,.png,.jpeg,.svg,.mp4,.wmv,.avi,.hwp,.doc,.docx,.xls,.xlsx,.pptx,.jpg,.jpeg,.png,.zip,.pdf,.txt,.jfif";
	var accepted_images = window.ACCEPTED_IMAGES ? window.ACCEPTED_IMAGES :".gif,.bmp,.jpg,.png,.jpeg,.jfif,.svg";
	var accepted_document = window.ACCEPTED_DOCUMENT ? window.ACCEPTED_DOCUMENT : ".hwp,.doc,.docx,.xls,.xlsx,.pptx,.jpg,.jpeg,.png,.zip,.pdf,.txt,.jfif";
	var accepted_movies = window.ACCEPTED_MOVIES ? window.ACCEPTED_MOVIES : ".mp4,.wmv,.avi" ;

	let acceptedUploadFiles ="";

	switch (atchFileTypeCd) {
	  case "A":
	    acceptedUploadFiles = accepted_files;	//가능한 모든첨부파일
	    break;
  	  case "I":
	    acceptedUploadFiles = accepted_images; //이미지
	    break;
	  case "D":
	    acceptedUploadFiles = accepted_document;	//문서
	    break;
	  case "M":
	    acceptedUploadFiles = accepted_movies;	//동영상
	    break;
	  default:
	    acceptedUploadFiles = accepted_files;
	}

	return acceptedUploadFiles ? acceptedUploadFiles : "";
}

function getMaxFileSize(){
	return window.UPLOAD_MAX_FILE_SIZE ? window.UPLOAD_MAX_FILE_SIZE : "50" ;
}

$(function () {
	fileUploader(); // 업로더 실행

	$(".btn-delete").on("click",function(){
		var oriFileSn =	$(this).data("atch-file-sn");
		if(typeof oriFileSn !== "undefined"){
			atchFileSnArr.push(oriFileSn);
		}
	});
});
