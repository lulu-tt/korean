"use strict";

// ===============================================
// [퍼블리싱 화면 구현 전용 UI 스크립트]
// **개발 반영 시 제외 필요**
// ===============================================

// [w3-include-html] 요소를 fetch로 읽어와 주입한다.
// file://로 직접 열면 CORS로 막히므로 Live Server 등 http(s)로 서빙해야 한다.
function loadIncludes(callback) {
	const includeElements = document.querySelectorAll("[w3-include-html]");

	if (!includeElements.length) {
		callback();
		return;
	}

	let pending = includeElements.length;

	includeElements.forEach((el) => {
		const file = el.getAttribute("w3-include-html");

		fetch(file)
			.then((res) => {
				if (!res.ok) throw new Error(`include load failed: ${file}`);
				return res.text();
			})
			.then((html) => {
				el.innerHTML = html;
				el.removeAttribute("w3-include-html");
			})
			.catch((err) => console.error(err))
			.finally(() => {
				pending -= 1;
				if (pending === 0) callback();
			});
	});
}

document.addEventListener("DOMContentLoaded", () => {
	loadIncludes(() => {
		document.dispatchEvent(new CustomEvent("includesLoaded"));
		if (typeof initGlobalUI === "function") {
			initGlobalUI();
		}
	});
});

