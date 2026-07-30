// zTreeCustom.js
// import "@ztree/ztree_v3/js/jquery.ztree.core";
// import "@ztree/ztree_v3/js/jquery.ztree.excheck";
// import "@ztree/ztree_v3/js/jquery.ztree.exedit";

// z-tree
var newCount = 1;
var log,
	className = "dark",
	curDragNodes,
	autoExpandNode;

// 일반 설정
var settingDefault = {
	view: {
		selectedMulti: false,
		showLine: false,
		addDiyDom: function (treeId, treeNode) {
			if (treeNode.disabled) {
				// 비활성화된 스타일을 설정
				const $treeNodeLink = $("#" + treeNode.tId + "_a");
				$treeNodeLink.addClass("disabled");

				$treeNodeLink.find(".button").after("<span class='label-disabled'>미사용</span>");
				// const iconsToInsert = [
				// 	".ico_docu",
				// 	".ico_open",
				// 	".ico-newwindow-md_ico_docu",
				// 	".ico-editpage-md_ico_docu",
				// 	".ico-pagepgm-md_ico_docu",
				// 	".ico-pagebbs-md_ico_docu",
				// 	".ico-code-md_ico_docu",
				// 	".ico-site-md_ico_docu"
				// ];
				// iconsToInsert.forEach((icon) => {
				// 	$treeNodeLink.find(icon).after("<span class='label-disabled'>미사용</span>");
				// });
			}
		}
	},
	edit: {
		enable: true,
		showRemoveBtn: false,
		showRenameBtn: false,
		drag: {
			autoExpandTrigger: true,
			prev: dropPrev,
			inner: dropInner,
			next: dropNext
		}
	},
	data: {
		simpleData: {
			enable: true
		}
		// node 하위 node로 이동 제한
		// keep: {
		// 	leaf: true
		// }
	},
	callback: {
		beforeDrag: beforeDrag,
		beforeDrop: beforeDrop,
		beforeDragOpen: beforeDragOpen,
		onDrag: onDrag,
		onDrop: onDrop,
		onExpand: onExpand,
		onClick: onClickHandler,
		beforeRename: beforeRenameHandler,
		onRename: onRenameHandler
	}
};

// checkbox가 추가되는 특이 케이스
var settingCheckbox = {
	view: {
		selectedMulti: false,
		showLine: false,
		addDiyDom: function (treeId, treeNode) {
			if (treeNode.disabled) {
				// 비활성화된 스타일을 설정
				$("#" + treeNode.tId + "_a").addClass("disabled");
				$("#" + treeNode.tId + "_a")
					.find(".ico_docu")
					.after("<span class='label-disabled'>미사용</span>");
			}
		}
	},
	check: {
		enable: true,
		nocheckInherit: true
	},
	edit: {
		drag: {
			autoExpandTrigger: true,
			prev: dropPrev,
			inner: dropInner,
			next: dropNext
		},
		enable: true,
		showRemoveBtn: false,
		showRenameBtn: false
	},
	data: {
		simpleData: {
			enable: true
		}
		// node 하위 node로 이동 제한
		// keep: {
		// 	leaf: true
		// }
	},
	callback: {
		beforeDrag: beforeDrag,
		beforeDrop: beforeDrop,
		beforeDragOpen: beforeDragOpen,
		onDrag: onDrag,
		onDrop: onDrop,
		onExpand: onExpand
		// onClick: onClickHandler
	}
};

// 메뉴트리 전체 펼침, 닫힘
// function expandNode(e) {
// 	var zTree = $.fn.zTree.getZTreeObj("treeMenu"),
// 		type = e.data.type;

// 	if (type == "expandAll") {
// 		zTree.expandAll(true);
// 	} else if (type == "collapseAll") {
// 		zTree.expandAll(false);
// 	}
// }

function onClickHandler(event, treeId, treeNode) {
	if (typeof window.zTreeOnClick === "function") {
		window.zTreeOnClick(event, treeId, treeNode);
	}

	// 최상위 노드 선택시 삭제, 순서 변경 버튼 비활성화
	if (!treeNode.getParentNode()) {
        $("#btnDelt").addClass("disabled").attr("disabled", "disabled");
        $("#btnOrdrUpdt").addClass("disabled").attr("disabled", "disabled");
    } else {
        $("#btnDelt").removeClass("disabled").removeAttr("disabled");
        $("#btnOrdrUpdt").removeClass("disabled").removeAttr("disabled");
    }
}

// 커스텀 onClick 함수를 설정하는 함수
function zTreeOnClick(onClickFunction) {
	if (typeof onClickFunction === "function") {
		settingDefault.callback.onClick = onClickFunction;
	}
}

// 기존 이름
function beforeRenameHandler(treeId, treeNode, newName, isCancel) {
	if (typeof window.zTreeBeforeRename === "function") {
		return window.zTreeBeforeRename(treeId, treeNode, newName, isCancel);
	}
}

function zTreeBeforeRename(renameFunction) {
	if (typeof renameFunction === "function") {
		settingDefault.callback.beforeRename = renameFunction;
	}
}

// 이름 변경
function onRenameHandler(e, treeId, treeNode, isCancel) {
	if (typeof window.zTreeRename === "function") {
		window.zTreeRename(e, treeId, treeNode, isCancel);
	}
	// console.log(e, treeId, treeNode, isCancel);
}

function zTreeOnRename(renameFunction) {
	if (typeof renameFunction === "function") {
		settingDefault.callback.onRename = renameFunction;
	}
}

function expandNode(e) {
	var treeId = e.data.treeId || "treeMenu";
	var zTree = $.fn.zTree.getZTreeObj(treeId),
		type = e.data.type;

	if (type == "expandAll") {
		zTree.expandAll(true);
	} else if (type == "collapseAll") {
		zTree.expandAll(false);
	}
}

// 메뉴 추가
var addedNode = null; // 추가된 노드를 저장하기 위한 전역 변수

function add(e) {
	var zTree = $.fn.zTree.getZTreeObj("treeMenu"),
		nodes = zTree.getSelectedNodes(),
		treeNode = nodes[0];

	if (nodes.length == 0) {
		alert("트리의 항목을 선택해 주세요.");
		return;
	}

	if (treeNode) {
		if (addedNode && addedNode !== treeNode) {
			// 이전에 추가된 노드 초기화
			zTree.removeNode(addedNode);
			addedNode = null;
		}

		var isParent = e.data.isParent;

		if (treeNode === addedNode) {
			alert({
				icon: "warning",
				message: "현재 트리의 하위에 트리를 추가할 수 없어요."
			});
			return;
		}

		// var isParent = e.data.isParent;
		// treeNode.isParent = true; // 기존 노드를 부모 노드로 변경
		// addedNode = zTree.addNodes(treeNode, {
		// 	id: 100 + newCount,
		// 	pId: treeNode.id,
		// 	isParent: isParent,
		// 	name: "사이트 메뉴명" + newCount++
		// })[0];

		if (typeof window.zTreeCreateNewNode === "function") {
			addedNode = window.zTreeCreateNewNode(zTree, treeNode, isParent);
		}
	}

	if (addedNode) {
		zTree.editName(addedNode);
	} else {
		alert("트리의 항목을 선택해 주세요.");
	}
}

window.zTreeCreateNewNode = function (zTree, treeNode, isParent) {
	const customNameFunc = function () {};
	const nameFunc = function () {
		const customName = customNameFunc();
		if (customName !== null && customName !== undefined) {
			return customName;
		} else {
			return "이름을 입력해주세요.";
		}
	};

	return window.createNewNode(zTree, treeNode, isParent, nameFunc);
};

// zTree 노드 생성시 기준 네이밍 변경
window.newCount = 1;
window.createNewNode = function (zTree, treeNode, isParent, nameFunc) {
	var newNodeName;
	if (typeof nameFunc === "function") {
		newNodeName = nameFunc();
	} else {
		newNodeName = "이름을 입력해주세요.";
	}
	treeNode.isParent = true; // 기존 노드를 부모 노드로 변경

	const addedNode = zTree.addNodes(treeNode, {
		id: 10000 + newCount,
		pId: treeNode.id,
		isParent: isParent,
		name: newNodeName
	})[0];

	return addedNode;
};

// 메뉴 삭제
function remove(e) {
	var zTree = $.fn.zTree.getZTreeObj("treeMenu"),
		nodes = zTree.getSelectedNodes(),
		treeNode = nodes[0];
	if (nodes.length == 0) {
		alert("트리의 항목을 선택해 주세요.");
		return;
	}

	if (!treeNode.getParentNode()) {
        alert({
            icon: "warning",
            message: "최상위 항목은 삭제할 수 없어요."
        });
        return;
    }

	var callbackFlag = $("#callbackTrigger").attr("checked");

	confirm(
		{
			icon: "error", //info, success, warning, error, warning-gray
			title: "정말 삭제하시겠어요?",
			message: "하위 항목까지 모두 삭제돼요."
		},
		function (result) {
			if (result) {
				// 확인 버튼을 클릭한 경우
				zTree.removeNode(treeNode, callbackFlag);
				alert("정상적으로 삭제되었어요.");
				removeNodeId(treeNode); // 삭제된 노드를 전달
			} else {
				// 취소 버튼을 클릭한 경우
				alert("삭제하지 않았어요.");
				return false;
			}
		}
	);
}


function checkDropRules(nodes, targetNode, moveType) {
    const isRootNode = nodes[0].getParentNode() === null;
    // 최상위가 아닌 노드를 루트로 이동하려고 하면 막음
    if (!isRootNode && (!targetNode || targetNode.pId === null)) {
        alert("해당 위치로는 이동할 수 없습니다.");
        return false;
    }
    
    let newDepth;
    if (moveType === "inner") {
        // targetNode의 자식으로 드롭하는 경우
        newDepth = getDepth(targetNode) + 1;
    } else {
        // dropPrev 또는 dropNext: 실제 새 부모는 targetNode의 부모
        if (targetNode.getParentNode()) {
            newDepth = getDepth(targetNode.getParentNode()) + 1;
        } else {
            newDepth = 1;
        }
    }
    
    let minAllowedDepth = (typeof window.zTreeDragDepthLimit === 'number') ? window.zTreeDragDepthLimit : 1;
    if (newDepth < minAllowedDepth) {
        alert("해당 위치로는 이동할 수 없습니다.");
        return false;
    }
    
    // (선택사항) 최대 깊이 제한 체크가 필요한 경우
    if (typeof window.zTreeMaxDepth === "number") {
        // targetNode를 기준으로 새 깊이를 다시 계산
        let computedDepth = (moveType === "inner") ? (getDepth(targetNode) + 1)
                                                   : (targetNode.getParentNode() ? getDepth(targetNode.getParentNode()) + 1 : 1);
        if (computedDepth > window.zTreeMaxDepth) {
            alert("해당 위치로는 이동할 수 없습니다.");
            return false;
        }
    }
    
    return true;
}
function getDepth(node) {
    let depth = 0;
    while (node && node.getParentNode()) {
        depth++;
        node = node.getParentNode();
    }
    return depth;
}

//메뉴 변경, 드레그 기능
function dropPrev(treeId, nodes, targetNode) {
	var pNode = targetNode.getParentNode();
	if (pNode && pNode.dropInner === false) {
		return false;
	} else {
		for (var i = 0, l = curDragNodes.length; i < l; i++) {
			var curPNode = curDragNodes[i].getParentNode();
			if (curPNode && curPNode !== targetNode.getParentNode() && curPNode.childOuter === false) {
				return false;
			}
		}
	}
	return true;
}

function dropInner(treeId, nodes, targetNode) {
	if (targetNode && targetNode.dropInner === false) {
		return false;
	} else {
		for (var i = 0, l = curDragNodes.length; i < l; i++) {
			if (!targetNode && curDragNodes[i].dropRoot === false) {
				return false;
			} else if (
				curDragNodes[i].parentTId &&
				curDragNodes[i].getParentNode() !== targetNode &&
				curDragNodes[i].getParentNode().childOuter === false
			) {
				return false;
			}
		}
	}
	return true;
}

function dropNext(treeId, nodes, targetNode) {
	var pNode = targetNode.getParentNode();
	if (pNode && pNode.dropInner === false) {
		return false;
	} else {
		for (var i = 0, l = curDragNodes.length; i < l; i++) {
			var curPNode = curDragNodes[i].getParentNode();
			if (curPNode && curPNode !== targetNode.getParentNode() && curPNode.childOuter === false) {
				return false;
			}
		}
	}
	return true;
}
function beforeDrag(treeId, treeNodes) {
    if (window.zTreeDragEnabled === false) {
        return false; // 전역 드래그 비활성화 설정
    }
    
    // 기본적으로 0뎁스(루트)는 드래그 불가하며,
    // 별도로 값이 지정되면 해당 값 뎁스부터 드래그를 허용
    // (값이 없으면 기본 1뎁스부터 허용)
    const allowedDepth = (typeof window.zTreeDragDepthLimit === "number") ? window.zTreeDragDepthLimit : 1;
    
    className = className === "dark" ? "" : "dark";
    showLog("[ " + getTime() + " beforeDrag ]&nbsp;&nbsp;&nbsp;&nbsp; drag: " + treeNodes.length + " nodes.");
    
    for (var i = 0, l = treeNodes.length; i < l; i++) {
        // 현재 노드의 깊이를 구해서 제한값보다 작으면 드래그 차단
        if (getDepth(treeNodes[i]) < allowedDepth) {
            curDragNodes = null;
            return false;
        }
        
        if (treeNodes[i].drag === false) {
            curDragNodes = null;
            return false;
        } else if (treeNodes[i].parentTId && treeNodes[i].getParentNode().childDrag === false) {
            curDragNodes = null;
            return false;
        }
    }
    curDragNodes = treeNodes;
    return true;
}

function beforeDragOpen(treeId, treeNode) {
	autoExpandNode = treeNode;
	return true;
}

function beforeDrop(treeId, treeNodes, targetNode, moveType, isCopy) {
	className = className === "dark" ? "" : "dark";
	showLog("[ " + getTime() + " beforeDrop ]&nbsp;&nbsp;&nbsp;&nbsp; moveType:" + moveType);
	showLog(
		"target: " +
			(targetNode ? targetNode.name : "root") +
			"  -- is " +
			(isCopy == null ? "cancel" : isCopy ? "copy" : "move")
	);

 // 기존 이동 제한 적용: 최상위 이동 제한과 새 깊이 체크
    if (!window.zTreeAllowRootDrop) {  
        if (!checkDropRules(treeNodes, targetNode, moveType)) {
            return false;
        }
    }

	return true;
}

function onDrag(event, treeId, treeNodes) {
	className = className === "dark" ? "" : "dark";
	showLog("[ " + getTime() + " onDrag ]&nbsp;&nbsp;&nbsp;&nbsp; drag: " + treeNodes.length + " nodes.");
}

function onDrop(event, treeId, treeNodes, targetNode, moveType, isCopy) {
	className = className === "dark" ? "" : "dark";
	showLog("[ " + getTime() + " onDrop ]&nbsp;&nbsp;&nbsp;&nbsp; moveType:" + moveType);
	showLog(
		"target: " +
			(targetNode ? targetNode.name : "root") +
			"  -- is " +
			(isCopy == null ? "cancel" : isCopy ? "copy" : "move")
	);
}

function onExpand(event, treeId, treeNode) {
	if (treeNode === autoExpandNode) {
		className = className === "dark" ? "" : "dark";
		showLog("[ " + getTime() + " onExpand ]&nbsp;&nbsp;&nbsp;&nbsp;" + treeNode.name);
	}
}

function showLog(str) {
	if (!log) log = $("#log");
	log.append("<li class='" + className + "'>" + str + "</li>");
	if (log.children("li").length > 8) {
		log.get(0).removeChild(log.children("li")[0]);
	}
}

function getTime() {
	var now = new Date(),
		h = now.getHours(),
		m = now.getMinutes(),
		s = now.getSeconds(),
		ms = now.getMilliseconds();
	return h + ":" + m + ":" + s + " " + ms;
}

function setTrigger() {
	var zTree = $.fn.zTree.getZTreeObj("treeDemo");
	zTree.setting.edit.drag.autoExpandTrigger = $("#callbackTrigger").attr("checked");
}

$(function () {
	// 기본 설정
	if ($("#treeMenu").length) {
		$.fn.zTree.init($("#treeMenu"), settingDefault, zNodes);
		// 메뉴트리 전체 펼침
		$("#btnOpenTree").on("click", { treeId: "treeMenu", type: "expandAll" }, expandNode);
		// 메뉴트리 전체 닫힘
		$("#btnCloseTree").on("click", { treeId: "treeMenu", type: "collapseAll" }, expandNode);
		// 메뉴 추가
		$("#btnAdd").on("click", { isParent: false }, add);
		// 메뉴 삭제
		$("#btnDelt").on("click", remove);
		// 메뉴 변경
		$("#callbackTrigger").on("change", {}, setTrigger);
	}

	// 특이케이스 (체크박스)
	if ($("#treeMenuCheck").length) {
		$.fn.zTree.init($("#treeMenuCheck"), settingCheckbox, zNodes);

		// 메뉴트리 전체 펼침
		$("#btnOpenTree").on("click", { treeId: "treeMenuCheck", type: "expandAll" }, expandNode);
		// 메뉴트리 전체 닫힘
		$("#btnCloseTree").on("click", { treeId: "treeMenuCheck", type: "collapseAll" }, expandNode);

		$(".btn-select").on("click", function () {
			var clickedButton = $(this);
			$(".btn-select").removeClass("on");
			$(this).addClass("on");
			confirm(
				{
					icon: "warning",
					title: "조회시 오래 걸릴 수도 있어요",
					message: "데이터 처리량이 많아 늦어질 수 있어요.<br> 그래도 조회하시겠어요?"
				},
				function (result) {
					if (result) {
						nocheckAllNodes($.fn.zTree.getZTreeObj("treeMenuCheck"), false);
						// zTreeDataUpdate 함수가 있는지 확인
						if (typeof zTreeDataUpdate === "function") {
							var newData = zTreeDataUpdate(clickedButton);
							updateZNodes(newData);
						} else {
							console.log("zTreeDataUpdate 함수를 정의하세요.");
						}
					} else {
						nocheckAllNodes($.fn.zTree.getZTreeObj("treeMenuCheck"), true);
					}
				}
			);

			function updateZNodes(newData) {
				var zTree = $.fn.zTree.getZTreeObj("treeMenuCheck");
				zTree.destroy(); // 기존 트리를 삭제

				// 기존 zNodes에 newData를 덮어쓰거나 병합
				var zNodes = newData;

				// 	트리를 다시 초기화
				$.fn.zTree.init($("#treeMenuCheck"), settingCheckbox, zNodes);
			}

			function nocheckAllNodes(zTree, nocheck) {
				var nodes = zTree.transformToArray(zTree.getNodes());
				for (var i = 0, l = nodes.length; i < l; i++) {
					nodes[i].nocheck = nocheck;
					zTree.updateNode(nodes[i]);
				}
			}
		});
	}
});
