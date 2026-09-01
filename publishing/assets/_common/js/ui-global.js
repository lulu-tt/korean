"use strict";

// 패널/오버레이가 열려있는 동안 배경 스크롤을 막는다.
// className별로 카운트해 모두 풀렸을 때 실제로 해제 (모달이 겹쳐 뜨는 경우, 상위 알림만 닫혔다고 스크롤이 풀려버리는 것을 방지)
const scrollLock = {
	counts: {},
	lock(className) {
		const count = this.counts[className] || 0;
		if (count === 0) {
			const hasScrollbar = document.documentElement.scrollHeight > window.innerHeight;
			document.body.classList.add(className);
			document.body.classList.toggle("has-scroll-y", hasScrollbar);
		}
		this.counts[className] = count + 1;
	},
	unlock(className) {
		const count = Math.max(0, (this.counts[className] || 1) - 1);
		this.counts[className] = count;
		if (count === 0) {
			document.body.classList.remove(className);
			document.body.classList.remove("has-scroll-y");
		}
	}
};

// GNB(large 이상) — 1뎁스 메뉴 클릭 시 하위 메뉴 패널 토글
const gnbDesktop = {
	ensureBackdrop() {
		let backdrop = document.querySelector(".gnb-backdrop");
		if (!backdrop) {
			backdrop = document.createElement("div");
			backdrop.className = "gnb-backdrop";
			document.body.appendChild(backdrop);
		}
		return backdrop;
	},
	init() {
		const toggles = document.querySelectorAll(".gnb-toggle");
		if (!toggles.length) return;

		this.ensureBackdrop();

		toggles.forEach((toggle) => {
			toggle.addEventListener("click", () => this.toggle(toggle));
		});

		document.addEventListener("click", (event) => {
			if (!event.target.closest(".gnb")) this.closeAll();
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") this.closeAll();
		});

		document.addEventListener("focusout", (event) => {
			if (!event.target.closest(".gnb")) return;
			const next = event.relatedTarget;
			if (!next || !next.closest(".gnb")) this.closeAll();
		});
	},
	toggle(toggle) {
		const panel = document.getElementById(toggle.getAttribute("aria-controls"));
		const willOpen = toggle.getAttribute("aria-expanded") !== "true";
		this.closeAll();
		if (panel) panel.hidden = !willOpen;
		toggle.setAttribute("aria-expanded", String(willOpen));
		if (willOpen) {
			scrollLock.lock("is-gnb-desktop");
			document.querySelector(".gnb-backdrop")?.classList.add("active");
		}
	},
	closeAll() {
		const hadOpen = document.querySelector('.gnb-toggle[aria-expanded="true"]');
		document.querySelectorAll('.gnb-toggle[aria-expanded="true"]').forEach((toggle) => {
			toggle.setAttribute("aria-expanded", "false");
			const panel = document.getElementById(toggle.getAttribute("aria-controls"));
			if (panel) panel.hidden = true;
		});
		if (hadOpen) {
			scrollLock.unlock("is-gnb-desktop");
			document.querySelector(".gnb-backdrop")?.classList.remove("active");
		}
	}
};

// 유틸메뉴 내 정보 팝업 토글 — close()는 scrollManager에서도 호출된다
const utilMypage = {
	toggle: null,
	panel: null,
	init() {
		this.toggle = document.querySelector(".util-mypage-toggle");
		if (!this.toggle) return;

		this.panel = document.getElementById(this.toggle.getAttribute("aria-controls"));
		if (!this.panel) return;

		this.toggle.addEventListener("click", () => this.toggleOpen());

		document.addEventListener("click", (event) => {
			if (!event.target.closest(".util-mypage")) this.close();
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") this.close();
		});
	},
	toggleOpen() {
		const willOpen = this.toggle.getAttribute("aria-expanded") !== "true";
		this.toggle.setAttribute("aria-expanded", String(willOpen));
		this.panel.hidden = !willOpen;
	},
	close() {
		if (!this.toggle) return;
		this.toggle.setAttribute("aria-expanded", "false");
		this.panel.hidden = true;
	}
};

// 모바일 전체메뉴 오버레이 — 햄버거로 열면 오른쪽에서 슬라이드 인, 내부는 아코디언으로 하위 메뉴를 펼친다.
const mobileMenu = {
	menuToggle: null,
	menu: null,
	closeButton: null,
	init() {
		this.menuToggle = document.querySelector(".menu-toggle");
		this.menu = document.getElementById("mobile-menu");
		if (!this.menuToggle || !this.menu) return;

		this.closeButton = this.menu.querySelector(".mobile-menu-close");

		this.menuToggle.addEventListener("click", () => this.open());
		if (this.closeButton) this.closeButton.addEventListener("click", () => this.close());

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && this.menu.classList.contains("is-open")) this.close();
		});

		this.menu.querySelectorAll(".mobile-menu-toggle").forEach((toggle) => {
			toggle.addEventListener("click", () => this.toggleAccordion(toggle));
		});
	},
	open() {
		this.menu.classList.add("is-open");
		this.menuToggle.setAttribute("aria-expanded", "true");
		scrollLock.lock("is-gnb-mobile");
		// .mobile-menu가 .header 안에 있어 .header 전체가 아닌 .header .inner만 inert 처리 (오버레이 자신은 잠기지 않도록)
		document.querySelector(".header .inner")?.setAttribute("inert", "");
		document.querySelector(".container")?.setAttribute("inert", "");
		document.querySelector(".footer")?.setAttribute("inert", "");
		if (this.closeButton) this.closeButton.focus();
	},
	close() {
		this.menu.classList.remove("is-open");
		this.menuToggle.setAttribute("aria-expanded", "false");
		scrollLock.unlock("is-gnb-mobile");
		document.querySelector(".header .inner")?.removeAttribute("inert");
		document.querySelector(".container")?.removeAttribute("inert");
		document.querySelector(".footer")?.removeAttribute("inert");
		this.menuToggle.focus();
	},
	toggleAccordion(toggle) {
		const panel = document.getElementById(toggle.getAttribute("aria-controls"));
		const willOpen = toggle.getAttribute("aria-expanded") !== "true";
		toggle.setAttribute("aria-expanded", String(willOpen));
		if (panel) panel.hidden = !willOpen;
	}
};

// 스크롤 방향에 따라 헤더를 숨기고/보인다 — .wrap에 scroll-down/scroll-up 클래스를 토글한다.
// container 상단(= masthead+header 높이)을 지나 50px 더 스크롤했을 때만 동작
const scrollManager = {
	lastScrollY: 0,
	wrap: null,
	container: null,
	initialized: false,
	init() {
		if (this.initialized) return;
		this.wrap = document.querySelector(".wrap");
		this.container = document.querySelector(".container");
		if (!this.wrap || !this.container) return;

		this.initialized = true;
		window.addEventListener("scroll", () => this.handleScroll());
	},
	handleScroll() {
		const offsetTop = this.container.offsetTop;
		const scrollY = window.scrollY;
		const scrollingDown = scrollY > this.lastScrollY;

		if (scrollY > offsetTop + 50 && scrollingDown) {
			this.wrap.classList.add("scroll-down");
			this.wrap.classList.remove("scroll-up");
			utilMypage.close();
		} else if (scrollY > offsetTop + 50 && !scrollingDown) {
			this.wrap.classList.add("scroll-up");
			this.wrap.classList.remove("scroll-down");
		} else {
			this.wrap.classList.remove("scroll-down", "scroll-up");
		}

		this.lastScrollY = scrollY;
	}
};

// page-top-button — 평소엔 뷰포트 하단에 고정되다가, footer가 화면에 들어오면
// is-near-footer 클래스를 붙여 footer 위로 고정
const pageTopButton = {
	button: null,
	observer: null,
	init() {
		this.button = document.querySelector(".page-top-button");
		const footer = document.querySelector(".footer");
		if (!this.button || !footer) return;

		this.observer = new IntersectionObserver(([entry]) => {
			this.button.classList.toggle("is-near-footer", entry.isIntersecting);
		});
		this.observer.observe(footer);

		this.button.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});
	}
};

// 모달 — data-modal-open/close 트리거, 네이티브 dialog.showModal() 사용
// dialog별로 오프너를 따로 들고 있어야 모달 위에 alert/confirm이 겹쳐 떠도
// 각자 자기 오프너로 포커스가 돌아온다 (uiAlert/uiConfirm에서도 이 로직을 그대로 재사용한다).
const modal = {
	// 개별 dialog에 backdrop 클릭/Esc/닫힘 시 처리를 연결한다.
	// 정적 모달은 init()에서, uiAlert/uiConfirm이 만드는 dialog는 생성 시점에 한 번 호출한다.
	wireDialog(dialog) {
		const isAlert = !!dialog.querySelector(".popup-inner")?.classList.contains("modal-alert");

		// backdrop 클릭 시에만 target이 dialog 자신이 되므로 이렇게 판별
		dialog.addEventListener("click", (event) => {
			if (event.target === dialog && !isAlert) dialog.close();
		});

		// 얼럿/컨펌은 Esc로도 닫히지 않는다 — 반드시 버튼을 눌러야 한다.
		dialog.addEventListener("cancel", (event) => {
			if (isAlert) event.preventDefault();
		});

		dialog.addEventListener("close", () => {
			scrollLock.unlock("is-modal");
			if (!document.querySelector("dialog.modal[open]")) dialog._opener?.focus();
			dialog._opener = null;
		});
	},
	init() {
		const dialogs = document.querySelectorAll("dialog.modal");
		if (!dialogs.length) return;

		document.addEventListener("click", (event) => {
			const openTrigger = event.target.closest("[data-modal-open]");
			if (openTrigger) {
				const target = document.querySelector(openTrigger.getAttribute("data-modal-open"));
				if (target) this.open(target, openTrigger);
				return;
			}

			const closeTrigger = event.target.closest("[data-modal-close]");
			if (closeTrigger) closeTrigger.closest("dialog.modal")?.close();
		});

		dialogs.forEach((dialog) => this.wireDialog(dialog));
	},
	open(dialog, opener) {
		dialog._opener = opener ?? null;
		dialog.showModal();
		scrollLock.lock("is-modal");
		// 명시적 닫기 버튼이 있으면 그걸 우선하고, 없는 경우(얼럿 등)에만 첫 data-modal-close로 대체한다.
		(dialog.querySelector(".btn-modal-close") ?? dialog.querySelector("[data-modal-close]"))?.focus();
	}
};

// uiAlert / uiConfirm — 마크업 없이 JS만으로 알림/확인창 호출
// 사용법: uiAlert("메시지"), uiAlert({icon, title, message}, callback)
//        uiConfirm("메시지", callback), uiConfirm({icon, title, message}, callback)
const alertConfirm = {
	alertDialog: null,
	confirmDialog: null,
	pending: null,
	iconClassMap: {
		info: "ico-information-fill",
		success: "ico-success-fill",
		warning: "ico-warning-fill",
		error: "ico-error-fill"
	},

	init() {
		window.uiAlert = (input, callback) => this.alert(input, callback);
		window.uiConfirm = (input, callback) => this.confirm(input, callback);
	},
	normalizeOptions(input) {
		if (typeof input === "string") return { title: "", message: input, icon: null };
		const { title = "", message = "", icon = "info" } = input || {};
		return { title, message, icon: icon === "none" ? null : icon };
	},
	buildDialog(id, buttonsHtml) {
		const dialog = document.createElement("dialog");
		dialog.className = "modal";
		dialog.id = id;
		dialog.setAttribute("aria-modal", "true");
		dialog.innerHTML = `
			<div class="popup-inner modal-alert">
				<div class="popup-body">
					<div class="modal-alert-icon" hidden></div>
					<p class="popup-title" hidden></p>
					<p class="popup-message"></p>
				</div>
				<div class="popup-footer">${buttonsHtml}</div>
			</div>
		`;
		document.body.appendChild(dialog);
		modal.wireDialog(dialog);
		return dialog;
	},
	fillContent(dialog, { title, message, icon }) {
		const iconEl = dialog.querySelector(".modal-alert-icon");
		const titleEl = dialog.querySelector(".popup-title");
		const messageEl = dialog.querySelector(".popup-message");

		if (icon) {
			iconEl.innerHTML = `<i class="svg-icon ${this.iconClassMap[icon] || this.iconClassMap.info}"></i>`;
			iconEl.hidden = false;
		} else {
			iconEl.innerHTML = "";
			iconEl.hidden = true;
		}

		titleEl.hidden = !title;
		titleEl.textContent = title;
		messageEl.innerHTML = message;
	},
	settle(dialog, result) {
		const pending = this.pending;
		this.pending = null;
		if (dialog.open) dialog.close();
		pending?.callback?.(result);
		pending?.resolve(result);
	},
	getAlertDialog() {
		if (this.alertDialog) return this.alertDialog;
		this.alertDialog = this.buildDialog(
			"ui-alert-dialog",
			`<button type="button" class="btn btn-md btn-primary">확인</button>`
		);
		this.alertDialog.querySelector(".btn").addEventListener("click", () => this.settle(this.alertDialog));
		return this.alertDialog;
	},
	getConfirmDialog() {
		if (this.confirmDialog) return this.confirmDialog;
		this.confirmDialog = this.buildDialog(
			"ui-confirm-dialog",
			`<button type="button" class="btn btn-md btn-tertiary">취소</button><button type="button" class="btn btn-md btn-primary">확인</button>`
		);
		const [cancelBtn, okBtn] = this.confirmDialog.querySelectorAll(".btn");
		cancelBtn.addEventListener("click", () => this.settle(this.confirmDialog, false));
		okBtn.addEventListener("click", () => this.settle(this.confirmDialog, true));
		return this.confirmDialog;
	},
	open(dialog, options, callback) {
		if (dialog.open) dialog.close();
		this.fillContent(dialog, options);

		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

		return new Promise((resolve) => {
			this.pending = { callback, resolve };
			modal.open(dialog, opener);
			dialog.querySelector(".btn-primary")?.focus();
		});
	},
	alert(input, callback) {
		return this.open(this.getAlertDialog(), this.normalizeOptions(input), callback);
	},
	confirm(input, callback) {
		return this.open(this.getConfirmDialog(), this.normalizeOptions(input), callback);
	}
};

// accordion
const accordion = {
	initialized: false,
	init() {
		if (this.initialized) return;
		this.initialized = true;

		// 페이지 로드 시 이미 펼쳐진 상태(aria-expanded="true")인 패널의 초기 높이를 맞춘다.
		document.querySelectorAll('.accordion-toggle[aria-expanded="true"]').forEach((toggle) => {
			const panel = document.getElementById(toggle.getAttribute("aria-controls"));
			this.open(panel);
		});

		document.addEventListener("click", (event) => {
			let toggle = event.target.closest(".accordion-toggle");
			
			// 아코디언 테이블의 행 전체 클릭 지원
			if (!toggle) {
				const row = event.target.closest("tr.accordion-item-row");
				if (row) {
					// 행 내부의 다른 인터랙티브 요소(링크, 폼, ARIA role 기반 위젯 등)를 클릭한 경우는 제외
					const interactive = event.target.closest(
						'button:not(.accordion-toggle), a, input, select, textarea, [role="button"], [role="link"], [contenteditable]'
					);
					if (!interactive) {
						toggle = row.querySelector(".accordion-toggle");
					}
				}
			}

			if (!toggle) return;

			const panel = document.getElementById(toggle.getAttribute("aria-controls"));
			if (!panel) return;

			const willOpen = toggle.getAttribute("aria-expanded") !== "true";
			const group = toggle.closest(".accordion");

			if (group) {
				group.querySelectorAll(".accordion-toggle").forEach((otherToggle) => {
					if (otherToggle === toggle) return;
					otherToggle.setAttribute("aria-expanded", "false");
					this.close(document.getElementById(otherToggle.getAttribute("aria-controls")));
				});
			}

			toggle.setAttribute("aria-expanded", String(willOpen));
			if (willOpen) this.open(panel);
			else this.close(panel);
		});
	},
	open(panel) {
		if (!panel) return;
		panel.classList.add("is-open");
		panel.removeAttribute("inert");
		panel.style.maxHeight = `${panel.scrollHeight}px`;

		// 애니메이션 종료 후 max-height를 none으로 풀어 내부 동적 콘텐츠(중첩 토글 등) 확장 허용
		// 지연 시간은 CSS의 실제 transition-duration을 읽어서 계산 — CSS 쪽 값이 바뀌어도 자동으로 맞는다.
		const transitionMs = parseFloat(getComputedStyle(panel).transitionDuration) * 1000 || 250;
		clearTimeout(panel._accTimeout);
		panel._accTimeout = setTimeout(() => {
			if (panel.classList.contains("is-open")) {
				panel.style.maxHeight = "none";
			}
		}, transitionMs + 100); // CSS transition 시간에 여유를 둔 시간
	},
	close(panel) {
		if (!panel) return;
		
		// max-height가 none인 상태에서 닫으려면 현재 픽셀 높이를 먼저 명시하여 애니메이션이 동작하게 함
		if (panel.style.maxHeight === "none") {
			panel.style.maxHeight = `${panel.scrollHeight}px`;
			panel.offsetHeight; // 리플로우 강제 유발
		}
		
		clearTimeout(panel._accTimeout);
		panel.classList.remove("is-open");
		panel.setAttribute("inert", "");
		panel.style.maxHeight = "0px";
	}
};

// data-toggle-btn / data-toggle-content — 속성 매칭 기반 범용 콘텐츠 토글
const toggleContent = {
	initialized: false,
	init() {
		if (this.initialized) return;
		this.initialized = true;

		// 초기 상태 동기화 (aria-expanded 또는 .is-open 유무)
		document.querySelectorAll("[data-toggle-btn]").forEach((btn) => {
			const targetKey = btn.getAttribute("data-toggle-btn");
			if (!targetKey) return;

			const contents = document.querySelectorAll(`[data-toggle-content="${targetKey}"]`);
			if (!contents.length) return;

			const isExpanded =
				btn.getAttribute("aria-expanded") === "true" ||
				Array.from(contents).some((c) => c.classList.contains("is-open"));
			btn.setAttribute("aria-expanded", String(isExpanded));
			btn.classList.toggle("is-active", isExpanded);
			this.applyLabel(btn, isExpanded);

			contents.forEach((content) => {
				if (isExpanded) {
					content.classList.add("is-open");
					content.removeAttribute("inert");
				} else {
					content.classList.remove("is-open");
					content.setAttribute("inert", "");
				}
			});
		});

		document.addEventListener("click", (event) => {
			const btn = event.target.closest("[data-toggle-btn]");
			if (!btn) return;

			const targetKey = btn.getAttribute("data-toggle-btn");
			if (!targetKey) return;

			const contents = document.querySelectorAll(`[data-toggle-content="${targetKey}"]`);
			if (!contents.length) return;

			const willOpen = btn.getAttribute("aria-expanded") !== "true";
			btn.setAttribute("aria-expanded", String(willOpen));
			btn.classList.toggle("is-active", willOpen);
			this.applyLabel(btn, willOpen);

			contents.forEach((content) => {
				if (willOpen) {
					content.classList.add("is-open");
					content.removeAttribute("inert");
				} else {
					content.classList.remove("is-open");
					content.setAttribute("inert", "");
				}
			});
		});
	},
	// data-label-open(펼침 상태 문구)이 있으면 버튼 텍스트를 열림/닫힘에 맞춰 바꾼다.
	// 버튼 안에 아이콘을 같이 쓰는 경우, 아이콘까지 지워지지 않도록 텍스트는 .toggle-btn-label 안쪽만 바꾼다.
	// (.toggle-btn-label이 없으면 예전처럼 버튼 전체 텍스트를 바꾼다.)
	applyLabel(btn, isExpanded) {
		const openLabel = btn.getAttribute("data-label-open");
		if (!openLabel) return;
		const labelTarget = btn.querySelector(".toggle-btn-label") || btn;
		if (!btn.dataset.labelClosed) btn.dataset.labelClosed = labelTarget.textContent.trim();
		labelTarget.textContent = isExpanded ? openLabel : btn.dataset.labelClosed;
	}
};

// .file-attach-group — 첨부파일 버튼(.file-attach-btn) 클릭 시 같은 그룹의 숨긴 input(.file-attach-input)을 열고,
// 선택된 파일명을 표시용 input(.file-attach-name)에 채운다. id 매칭 없이 컨테이너 기준으로 동작해 그룹을 복사-붙여넣기만 하면 된다.
// 실제 업로드 전송/검증은 이 모듈의 범위가 아니다.
const fileAttach = {
	initialized: false,
	init() {
		if (this.initialized) return;
		this.initialized = true;

		document.addEventListener("click", (event) => {
			const btn = event.target.closest(".file-attach-btn");
			if (!btn) return;

			btn.closest(".file-attach-group")?.querySelector(".file-attach-input")?.click();
		});

		document.addEventListener("change", (event) => {
			const input = event.target.closest(".file-attach-input");
			if (!input) return;

			const display = input.closest(".file-attach-group")?.querySelector(".file-attach-name");
			if (!display) return;

			if (!input.files.length) {
				display.value = "";
			} else if (input.files.length === 1) {
				display.value = input.files[0].name;
			} else {
				display.value = `${input.files[0].name} 외 ${input.files.length - 1}건`;
			}
		});

		// 숨긴 input이 키보드 포커스를 받았을 때, 시각적으로는 버튼 쪽에 포커스 표시를 준다. (focusin/focusout은 기본적으로 버블링된다)
		document.addEventListener("focusin", (event) => {
			const input = event.target.closest(".file-attach-input");
			if (!input) return;
			input.closest(".file-attach-group")?.classList.add("is-focused");
		});
		document.addEventListener("focusout", (event) => {
			const input = event.target.closest(".file-attach-input");
			if (!input) return;
			input.closest(".file-attach-group")?.classList.remove("is-focused");
		});
	}
};

// .tab / [data-tab-group] — 탭 선택 시 활성화(.is-active, aria-selected) 및 매칭된 탭 콘텐츠 토글
const tabComponent = {
	initialized: false,
	init() {
		if (this.initialized) return;
		this.initialized = true;

		// 초기 상태 설정
		document.querySelectorAll(".tab, [data-tab-group]").forEach((group) => {
			const links = group.querySelectorAll(".tab-link, [role='tab']");
			if (!links.length) return;

			let activeLink = group.querySelector(".tab-link.is-active, [aria-selected='true']");
			if (!activeLink && links.length > 0) {
				activeLink = links[0];
			}

			if (activeLink) {
				this.activateTab(group, activeLink);
			}
		});

		document.addEventListener("click", (event) => {
			const link = event.target.closest(".tab-link, [role='tab']");
			if (!link) return;

			const group = link.closest(".tab, [data-tab-group]");
			if (!group) return;

			const href = link.getAttribute("href");
			if (href && (href.startsWith("#") || href === "#none" || href === "#;")) {
				event.preventDefault();
			}

			this.activateTab(group, link);
		});
	},
	activateTab(group, activeLink) {
		const links = group.querySelectorAll(".tab-link, [role='tab']");
		
		// 1. 해당 탭 그룹 내의 모든 패널 ID를 수집하여 Set으로 관리 (스코프 자동 형성)
		const allPanelIds = new Set();
		links.forEach((link) => {
			const controls = link.getAttribute("aria-controls");
			if (controls) {
				controls.split(" ").forEach(id => {
					if (id) allPanelIds.add(id);
				});
			}
		});

		// 2. 현재 클릭된 탭이 열어야 할 패널 ID 목록
		const targetControls = activeLink.getAttribute("aria-controls");
		const targetPanelIds = targetControls ? targetControls.split(" ").filter(Boolean) : [];

		// 3. 탭 버튼 상태 업데이트
		links.forEach((link) => {
			const isActive = link === activeLink;
			link.classList.toggle("is-active", isActive);
			if (link.hasAttribute("aria-selected")) {
				link.setAttribute("aria-selected", String(isActive));
			}
		});

		// 4. 수집된 모든 패널들 순회하며 활성/비활성 처리
		allPanelIds.forEach((panelId) => {
			// data-tab-panel 속성값 매칭 사용 (개발자 id 사용 고려). 같은 키를 가진 패널이 여러 개 있어도
			// (예: 반응형으로 마크업이 중복되는 경우) 전부 갱신되도록 querySelectorAll을 사용한다.
			const panels = document.querySelectorAll(`[data-tab-panel="${panelId}"]`);
			if (!panels.length) return;

			panels.forEach((panel) => {
				if (targetPanelIds.includes(panelId)) {
					panel.classList.add("is-active");
					panel.hidden = false;
					panel.removeAttribute("inert");
					panel.style.display = "";
				} else {
					panel.classList.remove("is-active");
					panel.hidden = true;
					panel.setAttribute("inert", "");
					panel.style.display = "none";
				}
			});
		});
	}
};

// .author-jamo-nav 등 가로 스크롤 탭에서 좌우 스크롤 가능 여부에 따라
// 화살표 버튼(.author-jamo-nav-btn)과 가장자리 음영(.author-jamo-edge) 노출을 제어
const jamoScrollNav = {
	initialized: false,
	init() {
		if (this.initialized) return;
		this.initialized = true;

		document.querySelectorAll(".author-jamo-nav").forEach((nav) => {
			const list = nav.querySelector(".author-jamo-list");
			if (!list) return;

			const prevBtn = nav.querySelector(".author-jamo-edge.prev .author-jamo-nav-btn");
			const nextBtn = nav.querySelector(".author-jamo-edge.next .author-jamo-nav-btn");

			const updateState = () => {
				const canScrollLeft = list.scrollLeft > 1;
				const canScrollRight = list.scrollLeft < list.scrollWidth - list.clientWidth - 1;
				nav.classList.toggle("is-scroll-left", canScrollLeft);
				nav.classList.toggle("is-scroll-right", canScrollRight);
			};

			list.addEventListener("scroll", updateState);
			window.addEventListener("resize", updateState);
			updateState();

			if (prevBtn) {
				prevBtn.addEventListener("click", () => {
					list.scrollBy({ left: -list.clientWidth * 0.7, behavior: "smooth" });
				});
			}
			if (nextBtn) {
				nextBtn.addEventListener("click", () => {
					list.scrollBy({ left: list.clientWidth * 0.7, behavior: "smooth" });
				});
			}
		});
	}
};

// DOMContentLoaded에서 초기화
function initGlobalUI() {
	gnbDesktop.init();
	utilMypage.init();
	mobileMenu.init();
	scrollManager.init();
	pageTopButton.init();
	modal.init();
	alertConfirm.init();
	accordion.init();
	toggleContent.init();
	fileAttach.init();
	tabComponent.init();
	jamoScrollNav.init();
}

document.addEventListener("DOMContentLoaded", initGlobalUI);

