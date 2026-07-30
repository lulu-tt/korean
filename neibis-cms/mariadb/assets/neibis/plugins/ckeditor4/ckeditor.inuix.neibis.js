// 기본 인스턴스 생성 셋팅
function shouldNormalizeTablePaste(html) {
	return typeof html === "string" && /<table[\s>]/i.test(html);
}

function normalizeTablePasteHtml(html) {
	if (!shouldNormalizeTablePaste(html)) {
		return html;
	}

	var pasteProfile = detectPasteProfile(html);
	if (pasteProfile === "hwp") {
		return normalizeHwpFragmentHtml(html);
	}

	var container = document.createElement("div");
	container.innerHTML = html;
	var tables = container.querySelectorAll("table");
	for (var i = 0; i < tables.length; i++) {
		normalizeTableElement(tables[i], pasteProfile);
	}

	return container.innerHTML;
}

function normalizeHwpFragmentHtml(html) {
	if (typeof html !== "string" || !html) {
		return html;
	}

	if (/data-neibis-hwp-fragment\s*=\s*["']true["']/i.test(html)) {
		return html;
	}

	var width = extractHwpFragmentWidth(html);
	var wrapperStyle = width ? ' style="width: ' + width + '; margin: 0 auto;"' : ' style="margin: 0 auto;"';
	return '<div data-neibis-hwp-fragment="true"' + wrapperStyle + ">" + html + "</div>";
}

function extractHwpFragmentWidth(html) {
	var width = extractStyledWidthFromTag(html, "table");
	if (width) {
		return width;
	}

	width = extractLargestColspanCellWidth(html);
	if (width) {
		return width;
	}

	width = extractLargestRowWidth(html);
	if (width) {
		return width;
	}

	return "";
}

function extractStyledWidthFromTag(html, tagName) {
	if (typeof html !== "string" || !html || !tagName) {
		return "";
	}

	var tagPattern = new RegExp("<" + tagName + "\\b[^>]*\\bstyle\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "ig");
	var tagMatch;
	var maxWidthPx = 0;
	while ((tagMatch = tagPattern.exec(html))) {
		var styleText = tagMatch[2] || tagMatch[3] || "";
		var widthPx = extractWidthPxFromStyle(styleText);
		if (widthPx > maxWidthPx) {
			maxWidthPx = widthPx;
		}
	}

	return formatWidthPx(maxWidthPx);
}

function extractLargestColspanCellWidth(html) {
	if (typeof html !== "string" || !html) {
		return "";
	}

	var cellPattern = /<(td|th)\b[^>]*>/ig;
	var cellMatch;
	var maxWidthPx = 0;
	while ((cellMatch = cellPattern.exec(html))) {
		var tagText = cellMatch[0];
		var colspanMatch = tagText.match(/\bcolspan\s*=\s*["']?(\d+)/i);
		if (!colspanMatch || parseInt(colspanMatch[1], 10) < 2) {
			continue;
		}

		var styleMatch = tagText.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
		if (!styleMatch) {
			continue;
		}

		var styleText = styleMatch[1] || styleMatch[2] || "";
		var widthPx = extractWidthPxFromStyle(styleText);
		if (widthPx > maxWidthPx) {
			maxWidthPx = widthPx;
		}
	}

	return formatWidthPx(maxWidthPx);
}

function extractLargestRowWidth(html) {
	if (typeof html !== "string" || !html) {
		return "";
	}

	var rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/ig;
	var rowMatch;
	var maxWidthPx = 0;
	while ((rowMatch = rowPattern.exec(html))) {
		var rowHtml = rowMatch[1];
		var cellPattern = /<(td|th)\b[^>]*>/ig;
		var cellMatch;
		var rowWidthPx = 0;
		while ((cellMatch = cellPattern.exec(rowHtml))) {
			var tagText = cellMatch[0];
			var styleMatch = tagText.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
			if (!styleMatch) {
				continue;
			}

			var styleText = styleMatch[1] || styleMatch[2] || "";
			rowWidthPx += extractWidthPxFromStyle(styleText);
		}

		if (rowWidthPx > maxWidthPx) {
			maxWidthPx = rowWidthPx;
		}
	}

	return formatWidthPx(maxWidthPx);
}

function extractWidthPxFromStyle(styleText) {
	if (typeof styleText !== "string" || !styleText) {
		return 0;
	}

	var widthMatch = styleText.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)\s*(px|pt)\s*(?=;|$)/i);
	if (!widthMatch) {
		return 0;
	}

	var widthValue = parseFloat(widthMatch[1]);
	if (!isFinite(widthValue) || widthValue <= 0) {
		return 0;
	}

	var unit = (widthMatch[2] || "px").toLowerCase();
	if (unit === "pt") {
		return widthValue * 96 / 72;
	}

	return widthValue;
}

function formatWidthPx(widthPx) {
	if (!isFinite(widthPx) || widthPx <= 0) {
		return "";
	}

	return Math.round(widthPx) + "px";
}

function repairHwpBordersInEditor(editor) {
	if (!editor || !editor.editable) {
		return;
	}

	var editable = editor.editable();
	if (!editable || !editable.$ || !editable.$.querySelectorAll) {
		return;
	}

	var fragments = editable.$.querySelectorAll('[data-neibis-hwp-fragment="true"]');
	if (!fragments.length) {
		return;
	}

	for (var i = 0; i < fragments.length; i++) {
		repairHwpTableBorders(fragments[i]);
	}

	editor.fire("change");
}

function detectPasteProfile(html) {
	if (!isLikelyHwpHtml(html)) {
		return "generic";
	}

	return "hwp";
}

function isLikelyHwpHtml(html) {
	if (typeof html !== "string" || !html) {
		return false;
	}

	var score = 0;
	var patterns = [
		/text-autospace\s*:\s*none/i,
		/layout-grid-mode\s*:/i,
		/hwp_editor_board_content/i,
		/data-hjsonver/i,
		/font-family\s*:\s*[^;"']*(한컴|휴먼명조|HCI|HY)/i,
		/class\s*=\s*["'][^"']*\b(?:hwp|HStyle|\d+)\b/i
	];

	for (var i = 0; i < patterns.length; i++) {
		if (patterns[i].test(html)) {
			score++;
		}
	}

	return score >= 2;
}

function normalizeTableElement(table, pasteProfile) {
	applyKeptStyles(table, getAllowedTableStyles(pasteProfile));
	moveLegacyWidthToStyle(table);
	ensureTableBody(table);
	removeOfficeOnlyAttrs(table, pasteProfile);

	var cols = table.querySelectorAll("col");
	for (var i = 0; i < cols.length; i++) {
		applyKeptStyles(cols[i], ["width"]);
		moveLegacyWidthToStyle(cols[i]);
		removeOfficeOnlyAttrs(cols[i], pasteProfile);
	}

	var cells = table.querySelectorAll("th, td");
	for (var j = 0; j < cells.length; j++) {
		normalizeTableCell(cells[j], pasteProfile);
	}
}

function getAllowedTableStyles(pasteProfile) {
	if (pasteProfile === "hwp") {
		return [
			"width",
			"min-width",
			"max-width",
			"border",
			"border-top",
			"border-right",
			"border-bottom",
			"border-left",
			"border-collapse",
			"border-spacing",
			"table-layout",
			"background",
			"background-color",
			"background-image",
			"background-repeat",
			"background-position",
			"background-size",
			"text-align"
		];
	}

	return [
		"width",
		"min-width",
		"max-width",
		"border",
		"border-collapse",
		"border-spacing",
		"table-layout",
		"background",
		"background-color",
		"text-align"
	];
}

function getAllowedCellStyles(pasteProfile) {
	if (pasteProfile === "hwp") {
		return [
			"width",
			"height",
			"padding",
			"padding-top",
			"padding-right",
			"padding-bottom",
			"padding-left",
			"border",
			"border-top",
			"border-right",
			"border-bottom",
			"border-left",
			"background",
			"background-color",
			"background-image",
			"background-repeat",
			"background-position",
			"background-size",
			"text-align",
			"vertical-align",
			"white-space",
			"line-height",
			"letter-spacing",
			"color",
			"font",
			"font-family",
			"font-size",
			"font-style",
			"font-weight"
		];
	}

	return [
		"width",
		"height",
		"border",
		"border-top",
		"border-right",
		"border-bottom",
		"border-left",
		"background",
		"background-color",
		"text-align",
		"vertical-align",
		"white-space"
	];
}

function normalizeTableCell(cell, pasteProfile) {
	normalizeSpanAttr(cell, "rowspan");
	normalizeSpanAttr(cell, "colspan");
	applyAlignmentAttrs(cell);
	applyKeptStyles(cell, getAllowedCellStyles(pasteProfile));
	moveLegacyWidthToStyle(cell);
	removeOfficeOnlyAttrs(cell, pasteProfile);
}

function normalizeSpanAttr(element, attrName) {
	var value = element.getAttribute(attrName);
	if (!value) {
		return;
	}

	var parsed = parseInt(value, 10);
	if (isNaN(parsed) || parsed < 1) {
		element.removeAttribute(attrName);
		return;
	}

	element.setAttribute(attrName, String(parsed));
}

function applyAlignmentAttrs(element) {
	var align = element.getAttribute("align");
	var verticalAlign = element.getAttribute("valign");
	var keptStyles = parseStyleText(element.getAttribute("style"));

	if (align && !keptStyles["text-align"]) {
		keptStyles["text-align"] = align;
	}

	if (verticalAlign && !keptStyles["vertical-align"]) {
		keptStyles["vertical-align"] = verticalAlign;
	}

	element.removeAttribute("align");
	element.removeAttribute("valign");
	writeStyleText(element, keptStyles);
}

function applyKeptStyles(element, allowedKeys) {
	var parsedStyles = parseStyleText(element.getAttribute("style"));
	var nextStyles = {};

	for (var i = 0; i < allowedKeys.length; i++) {
		var key = allowedKeys[i];
		if (parsedStyles[key]) {
			nextStyles[key] = parsedStyles[key];
		}
	}

	writeStyleText(element, nextStyles);
}

function moveLegacyWidthToStyle(element) {
	var width = normalizeCssSize(element.getAttribute("width"));
	if (!width) {
		return;
	}

	var parsedStyles = parseStyleText(element.getAttribute("style"));
	if (!parsedStyles.width) {
		parsedStyles.width = width;
		writeStyleText(element, parsedStyles);
	}
}

function ensureTableBody(table) {
	var directRows = [];
	for (var i = 0; i < table.children.length; i++) {
		if (table.children[i].tagName === "TR") {
			directRows.push(table.children[i]);
		}
	}

	if (!directRows.length) {
		return;
	}

	var tbody = table.querySelector("tbody") || document.createElement("tbody");
	if (!tbody.parentNode) {
		table.appendChild(tbody);
	}

	for (var j = 0; j < directRows.length; j++) {
		tbody.appendChild(directRows[j]);
	}
}

function removeOfficeOnlyAttrs(element, pasteProfile) {
	var className = element.getAttribute("class");
	if (className) {
		var nextClassName = className
			.split(/\s+/)
			.filter(function (name) {
				if (!name) {
					return false;
				}

				if (/^Mso/i.test(name)) {
					return false;
				}

				if (pasteProfile === "hwp") {
					return true;
				}

				return !/^(HStyle|hwp)/i.test(name);
			})
			.join(" ");

		if (nextClassName) {
			element.setAttribute("class", nextClassName);
		} else {
			element.removeAttribute("class");
		}
	}

	var attrNames = ["lang"];
	for (var i = 0; i < attrNames.length; i++) {
		element.removeAttribute(attrNames[i]);
	}
}

function parseStyleText(styleText) {
	var styleMap = {};
	if (!styleText) {
		return styleMap;
	}

	var styleItems = styleText.split(";");
	for (var i = 0; i < styleItems.length; i++) {
		var styleItem = styleItems[i];
		var separatorIndex = styleItem.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}

		var key = styleItem.substring(0, separatorIndex).trim().toLowerCase();
		var value = styleItem.substring(separatorIndex + 1).trim();

		if (!key || !value || key.indexOf("mso-") === 0) {
			continue;
		}

		styleMap[key] = value;
	}

	return styleMap;
}

function writeStyleText(element, styleMap) {
	var styleEntries = [];
	for (var key in styleMap) {
		if (Object.prototype.hasOwnProperty.call(styleMap, key) && styleMap[key]) {
			styleEntries.push(key + ": " + styleMap[key]);
		}
	}

	if (styleEntries.length) {
		element.setAttribute("style", styleEntries.join("; "));
	} else {
		element.removeAttribute("style");
	}
}

function normalizeCssSize(value) {
	if (!value) {
		return "";
	}

	var normalizedValue = String(value).trim();
	if (!normalizedValue) {
		return "";
	}

	if (/^\d+$/.test(normalizedValue)) {
		return normalizedValue + "px";
	}

	if (/^\d+(\.\d+)?(px|%|pt|em|rem|vh|vw)$/.test(normalizedValue)) {
		return normalizedValue;
	}

	return "";
}

function repairHwpTableBorders(container) {
	if (!container) {
		return;
	}

	var tables = container.querySelectorAll("table");
	for (var i = 0; i < tables.length; i++) {
		repairSingleHwpTableBorders(tables[i]);
	}
}

function repairSingleHwpTableBorders(table) {
	var grid = buildTableGrid(table);
	if (!grid || grid.length < 2 || getGridColumnCount(grid) < 2) {
		return;
	}

	var analysis = analyzeMissingInternalBorders(grid);
	var referenceBorders = detectTableBorderReferences(table, grid);
	if (!shouldRepairTableBorders(table, analysis, referenceBorders)) {
		return;
	}

	repairOuterTableBorders(grid, referenceBorders);
	repairVerticalBorders(grid, referenceBorders.internalVertical);
	repairHorizontalBorders(grid, referenceBorders.internalHorizontal);
}

function buildTableGrid(table) {
	var rows = table.querySelectorAll("tr");
	if (!rows.length) {
		return [];
	}

	var grid = [];
	for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		if (!grid[rowIndex]) {
			grid[rowIndex] = [];
		}

		var row = rows[rowIndex];
		var colIndex = 0;
		for (var childIndex = 0; childIndex < row.children.length; childIndex++) {
			var cell = row.children[childIndex];
			if (!cell || (cell.tagName !== "TD" && cell.tagName !== "TH")) {
				continue;
			}

			while (grid[rowIndex][colIndex]) {
				colIndex++;
			}

			var rowspan = parsePositiveInt(cell.getAttribute("rowspan")) || 1;
			var colspan = parsePositiveInt(cell.getAttribute("colspan")) || 1;

			for (var rowSpanOffset = 0; rowSpanOffset < rowspan; rowSpanOffset++) {
				var targetRowIndex = rowIndex + rowSpanOffset;
				if (!grid[targetRowIndex]) {
					grid[targetRowIndex] = [];
				}

				for (var colSpanOffset = 0; colSpanOffset < colspan; colSpanOffset++) {
					grid[targetRowIndex][colIndex + colSpanOffset] = {
						cell: cell,
						originRow: rowIndex,
						originCol: colIndex
					};
				}
			}

			colIndex += colspan;
		}
	}

	return grid;
}

function getGridColumnCount(grid) {
	var maxCount = 0;
	for (var i = 0; i < grid.length; i++) {
		if (grid[i] && grid[i].length > maxCount) {
			maxCount = grid[i].length;
		}
	}

	return maxCount;
}

function analyzeMissingInternalBorders(grid) {
	var verticalTotal = 0;
	var verticalMissing = 0;
	var horizontalTotal = 0;
	var horizontalMissing = 0;
	var colCount = getGridColumnCount(grid);

	for (var rowIndex = 0; rowIndex < grid.length; rowIndex++) {
		for (var colIndex = 0; colIndex < colCount - 1; colIndex++) {
			var leftEntry = grid[rowIndex] ? grid[rowIndex][colIndex] : null;
			var rightEntry = grid[rowIndex] ? grid[rowIndex][colIndex + 1] : null;
			if (!leftEntry || !rightEntry || leftEntry.cell === rightEntry.cell) {
				continue;
			}

			verticalTotal++;
			if (isMissingSharedBorder(leftEntry.cell, "border-right", rightEntry.cell, "border-left")) {
				verticalMissing++;
			}
		}
	}

	for (var scanRowIndex = 0; scanRowIndex < grid.length - 1; scanRowIndex++) {
		for (var scanColIndex = 0; scanColIndex < colCount; scanColIndex++) {
			var upperEntry = grid[scanRowIndex] ? grid[scanRowIndex][scanColIndex] : null;
			var lowerEntry = grid[scanRowIndex + 1] ? grid[scanRowIndex + 1][scanColIndex] : null;
			if (!upperEntry || !lowerEntry || upperEntry.cell === lowerEntry.cell) {
				continue;
			}

			horizontalTotal++;
			if (isMissingSharedBorder(upperEntry.cell, "border-bottom", lowerEntry.cell, "border-top")) {
				horizontalMissing++;
			}
		}
	}

	return {
		verticalTotal: verticalTotal,
		verticalMissing: verticalMissing,
		horizontalTotal: horizontalTotal,
		horizontalMissing: horizontalMissing
	};
}

function shouldRepairTableBorders(table, analysis, referenceBorders) {
	if (!table || !analysis || !referenceBorders) {
		return false;
	}

	var hasReferenceBorder =
		referenceBorders.internalVertical ||
		referenceBorders.internalHorizontal ||
		referenceBorders.outerTop ||
		referenceBorders.outerBottom ||
		referenceBorders.outerLeft ||
		referenceBorders.outerRight;
	if (!hasReferenceBorder) {
		return false;
	}

	var totalBoundaries = analysis.verticalTotal + analysis.horizontalTotal;
	var missingBoundaries = analysis.verticalMissing + analysis.horizontalMissing;
	if (totalBoundaries < 2 || missingBoundaries < 2) {
		return false;
	}

	var missingRatio = missingBoundaries / totalBoundaries;
	if (hasOuterBorder(table)) {
		return missingRatio >= 0.6;
	}

	if (!hasVisibleBorderCells(table, 3)) {
		return false;
	}

	if (totalBoundaries >= 8) {
		return missingRatio >= 0.45;
	}

	return missingRatio >= 0.6;
}

function hasOuterBorder(table) {
	var rows = table.querySelectorAll("tr");
	if (!rows.length) {
		return false;
	}

	var firstRowCells = getRowCells(rows[0]);
	var lastRowCells = getRowCells(rows[rows.length - 1]);
	if (!firstRowCells.length || !lastRowCells.length) {
		return false;
	}

	if (rowHasBorder(firstRowCells, "border-top")) {
		return true;
	}

	if (rowHasBorder(lastRowCells, "border-bottom")) {
		return true;
	}

	return rowHasBorder(getFirstColumnCells(rows), "border-left") || rowHasBorder(getLastColumnCells(rows), "border-right");
}

function getRowCells(row) {
	var cells = [];
	if (!row) {
		return cells;
	}

	for (var i = 0; i < row.children.length; i++) {
		var cell = row.children[i];
		if (cell && (cell.tagName === "TD" || cell.tagName === "TH")) {
			cells.push(cell);
		}
	}

	return cells;
}

function getFirstColumnCells(rows) {
	var cells = [];
	for (var i = 0; i < rows.length; i++) {
		var rowCells = getRowCells(rows[i]);
		if (rowCells.length) {
			cells.push(rowCells[0]);
		}
	}

	return cells;
}

function getLastColumnCells(rows) {
	var cells = [];
	for (var i = 0; i < rows.length; i++) {
		var rowCells = getRowCells(rows[i]);
		if (rowCells.length) {
			cells.push(rowCells[rowCells.length - 1]);
		}
	}

	return cells;
}

function rowHasBorder(cells, borderKey) {
	for (var i = 0; i < cells.length; i++) {
		var styleMap = parseStyleText(cells[i].getAttribute("style"));
		if (!isMissingBorderValue(styleMap[borderKey]) || !isMissingBorderValue(styleMap.border)) {
			return true;
		}
	}

	return false;
}

function hasVisibleBorderCells(table, minCount) {
	if (!table) {
		return false;
	}

	var cells = table.querySelectorAll("th, td");
	var visibleCount = 0;
	var borderKeys = ["border", "border-top", "border-right", "border-bottom", "border-left"];

	for (var i = 0; i < cells.length; i++) {
		var styleMap = parseStyleText(cells[i].getAttribute("style"));
		for (var j = 0; j < borderKeys.length; j++) {
			if (!isMissingBorderValue(styleMap[borderKeys[j]])) {
				visibleCount++;
				break;
			}
		}

		if (visibleCount >= minCount) {
			return true;
		}
	}

	return false;
}

function detectTableBorderReferences(table, grid) {
	var rows = table.querySelectorAll("tr");
	var topCells = rows.length ? getRowCells(rows[0]) : [];
	var bottomCells = rows.length ? getRowCells(rows[rows.length - 1]) : [];
	var outerTop = detectBoundaryReference(topCells, ["border-top", "border"]);
	var outerBottom = detectBoundaryReference(bottomCells, ["border-bottom", "border"]);
	var outerLeft = detectBoundaryReference(getFirstColumnCells(rows), ["border-left", "border"]);
	var outerRight = detectBoundaryReference(getLastColumnCells(rows), ["border-right", "border"]);
	var internalVertical = detectInternalReferenceBorder(grid, "vertical");
	var internalHorizontal = detectInternalReferenceBorder(grid, "horizontal");
	var fallbackBorder = detectFallbackReferenceBorder(table);

	if (!internalVertical && fallbackBorder) {
		internalVertical = normalizeFallbackInternalBorder(fallbackBorder);
	}

	if (!internalHorizontal && fallbackBorder) {
		internalHorizontal = fallbackBorder;
	}

	return {
		outerTop: outerTop,
		outerBottom: outerBottom,
		outerLeft: outerLeft,
		outerRight: outerRight,
		internalVertical: internalVertical,
		internalHorizontal: internalHorizontal
	};
}

function detectBoundaryReference(cells, borderKeys) {
	var bestBorder = null;
	for (var i = 0; i < cells.length; i++) {
		var styleMap = parseStyleText(cells[i].getAttribute("style"));
		for (var j = 0; j < borderKeys.length; j++) {
			bestBorder = choosePreferredBorder(bestBorder, parseBorderValue(styleMap[borderKeys[j]]));
		}
	}

	return bestBorder;
}

function detectInternalReferenceBorder(grid, direction) {
	var colCount = getGridColumnCount(grid);
	var bestBorder = null;

	if (direction === "vertical") {
		for (var rowIndex = 0; rowIndex < grid.length; rowIndex++) {
			for (var colIndex = 0; colIndex < colCount - 1; colIndex++) {
				var leftEntry = grid[rowIndex] ? grid[rowIndex][colIndex] : null;
				var rightEntry = grid[rowIndex] ? grid[rowIndex][colIndex + 1] : null;
				if (!leftEntry || !rightEntry || leftEntry.cell === rightEntry.cell) {
					continue;
				}

				bestBorder = choosePreferredBorder(bestBorder, getCellBorderValue(leftEntry.cell, "border-right"));
				bestBorder = choosePreferredBorder(bestBorder, getCellBorderValue(rightEntry.cell, "border-left"));
			}
		}

		return bestBorder;
	}

	for (var scanRowIndex = 0; scanRowIndex < grid.length - 1; scanRowIndex++) {
		for (var scanColIndex = 0; scanColIndex < colCount; scanColIndex++) {
			var upperEntry = grid[scanRowIndex] ? grid[scanRowIndex][scanColIndex] : null;
			var lowerEntry = grid[scanRowIndex + 1] ? grid[scanRowIndex + 1][scanColIndex] : null;
			if (!upperEntry || !lowerEntry || upperEntry.cell === lowerEntry.cell) {
				continue;
			}

			bestBorder = choosePreferredBorder(bestBorder, getCellBorderValue(upperEntry.cell, "border-bottom"));
			bestBorder = choosePreferredBorder(bestBorder, getCellBorderValue(lowerEntry.cell, "border-top"));
		}
	}

	return bestBorder;
}

function detectFallbackReferenceBorder(table) {
	var cells = table.querySelectorAll("th, td");
	var bestBorder = null;
	var borderKeys = ["border-top", "border-right", "border-bottom", "border-left", "border"];

	for (var i = 0; i < cells.length; i++) {
		var styleMap = parseStyleText(cells[i].getAttribute("style"));
		for (var j = 0; j < borderKeys.length; j++) {
			bestBorder = choosePreferredBorder(bestBorder, parseBorderValue(styleMap[borderKeys[j]]));
		}
	}

	return bestBorder;
}

function getCellBorderValue(cell, borderKey) {
	var styleMap = parseStyleText(cell.getAttribute("style"));
	return parseBorderValue(styleMap[borderKey]) || parseBorderValue(styleMap.border);
}

function choosePreferredBorder(currentBorder, candidateBorder) {
	if (!candidateBorder) {
		return currentBorder;
	}

	if (!currentBorder) {
		return candidateBorder;
	}

	var currentScore = getBorderPreferenceScore(currentBorder);
	var candidateScore = getBorderPreferenceScore(candidateBorder);
	if (candidateScore < currentScore) {
		return candidateBorder;
	}

	return currentBorder;
}

function getBorderPreferenceScore(border) {
	var styleRank = 3;
	if (border.style === "solid") {
		styleRank = 0;
	} else if (border.style === "dashed") {
		styleRank = 1;
	} else if (border.style === "dotted") {
		styleRank = 2;
	}

	return border.width * 10 + styleRank;
}

function normalizeFallbackInternalBorder(border) {
	if (!border) {
		return null;
	}

	if (border.style !== "double" && border.width <= 2) {
		return border;
	}

	return {
		width: 1,
		style: "solid",
		color: border.color
	};
}

function normalizeRepairBorder(border) {
	if (!border) {
		return null;
	}

	if (border.style === "double") {
		return {
			width: 1,
			style: "solid",
			color: border.color
		};
	}

	return border;
}

function parseBorderValue(value) {
	if (isMissingBorderValue(value)) {
		return null;
	}

	var normalizedValue = String(value).trim().toLowerCase();
	var widthMatch = normalizedValue.match(/(\d+(?:\.\d+)?)px/);
	var width = widthMatch ? parseFloat(widthMatch[1]) : 1;
	var styleMatch = normalizedValue.match(/\b(solid|dashed|dotted|double)\b/);
	var colorMatch = normalizedValue.match(/(#[0-9a-f]{3,8}|rgba?\([^)]+\))/);
	var color = colorMatch ? colorMatch[1] : "#000000";
	var style = styleMatch ? styleMatch[1] : "solid";

	if (!colorMatch) {
		var wordMatches = normalizedValue.match(/\b[a-z]+\b/g) || [];
		for (var i = wordMatches.length - 1; i >= 0; i--) {
			if (!/^(solid|dashed|dotted|double|none|hidden|px)$/.test(wordMatches[i])) {
				color = wordMatches[i];
				break;
			}
		}
	}

	if (!width || width <= 0 || style === "none" || style === "hidden") {
		return null;
	}

	return {
		width: width,
		style: style,
		color: color
	};
}

function isMissingSharedBorder(firstCell, firstBorderKey, secondCell, secondBorderKey) {
	var firstStyleMap = parseStyleText(firstCell.getAttribute("style"));
	var secondStyleMap = parseStyleText(secondCell.getAttribute("style"));

	return isMissingBorderValue(firstStyleMap[firstBorderKey]) && isMissingBorderValue(secondStyleMap[secondBorderKey]);
}

function isMissingBorderValue(value) {
	if (!value) {
		return true;
	}

	var normalizedValue = String(value).trim().toLowerCase();
	if (!normalizedValue || normalizedValue === "none" || normalizedValue === "hidden") {
		return true;
	}

	return /^0(?:px|pt|em|rem|%)?(?:\s+[a-z]+(?:\s+[^;]+)?)?$/i.test(normalizedValue);
}

function repairVerticalBorders(grid, borderValue) {
	if (!borderValue) {
		return;
	}

	var repairBorderValue = normalizeRepairBorder(borderValue);
	var colCount = getGridColumnCount(grid);

	for (var rowIndex = 0; rowIndex < grid.length; rowIndex++) {
		for (var colIndex = 0; colIndex < colCount - 1; colIndex++) {
			var leftEntry = grid[rowIndex] ? grid[rowIndex][colIndex] : null;
			var rightEntry = grid[rowIndex] ? grid[rowIndex][colIndex + 1] : null;
			if (!leftEntry || !rightEntry || leftEntry.cell === rightEntry.cell) {
				continue;
			}

			if (!isMissingSharedBorder(leftEntry.cell, "border-right", rightEntry.cell, "border-left")) {
				continue;
			}

			setCellBorderIfMissing(leftEntry.cell, "border-right", repairBorderValue);
		}
	}
}

function repairHorizontalBorders(grid, borderValue) {
	if (!borderValue) {
		return;
	}

	var repairBorderValue = normalizeRepairBorder(borderValue);
	var colCount = getGridColumnCount(grid);

	for (var rowIndex = 0; rowIndex < grid.length - 1; rowIndex++) {
		for (var colIndex = 0; colIndex < colCount; colIndex++) {
			var upperEntry = grid[rowIndex] ? grid[rowIndex][colIndex] : null;
			var lowerEntry = grid[rowIndex + 1] ? grid[rowIndex + 1][colIndex] : null;
			if (!upperEntry || !lowerEntry || upperEntry.cell === lowerEntry.cell) {
				continue;
			}

			if (!isMissingSharedBorder(upperEntry.cell, "border-bottom", lowerEntry.cell, "border-top")) {
				continue;
			}

			setCellBorderIfMissing(upperEntry.cell, "border-bottom", repairBorderValue);
		}
	}
}

function repairOuterTableBorders(grid, referenceBorders) {
	if (!referenceBorders) {
		return;
	}

	repairOuterVerticalBorders(grid, referenceBorders.outerLeft, referenceBorders.outerRight);
	repairOuterHorizontalBorders(grid, referenceBorders.outerTop, referenceBorders.outerBottom);
}

function repairOuterVerticalBorders(grid, leftBorderValue, rightBorderValue) {
	var leftProcessedCells = [];
	var rightProcessedCells = [];
	var colCount = getGridColumnCount(grid);

	for (var rowIndex = 0; rowIndex < grid.length; rowIndex++) {
		var row = grid[rowIndex];
		if (!row || !row.length) {
			continue;
		}

		var firstEntry = null;
		for (var firstColIndex = 0; firstColIndex < colCount; firstColIndex++) {
			if (row[firstColIndex]) {
				firstEntry = row[firstColIndex];
				break;
			}
		}

		var lastEntry = null;
		for (var lastColIndex = colCount - 1; lastColIndex >= 0; lastColIndex--) {
			if (row[lastColIndex]) {
				lastEntry = row[lastColIndex];
				break;
			}
		}

		if (leftBorderValue && firstEntry && leftProcessedCells.indexOf(firstEntry.cell) === -1) {
			setCellBorderIfMissing(firstEntry.cell, "border-left", leftBorderValue);
			leftProcessedCells.push(firstEntry.cell);
		}

		if (rightBorderValue && lastEntry && rightProcessedCells.indexOf(lastEntry.cell) === -1) {
			setCellBorderIfMissing(lastEntry.cell, "border-right", rightBorderValue);
			rightProcessedCells.push(lastEntry.cell);
		}
	}
}

function repairOuterHorizontalBorders(grid, topBorderValue, bottomBorderValue) {
	if (!grid.length) {
		return;
	}

	var topProcessedCells = [];
	var bottomProcessedCells = [];

	if (topBorderValue) {
		for (var topColIndex = 0; topColIndex < grid[0].length; topColIndex++) {
			var topEntry = grid[0][topColIndex];
			if (!topEntry || topProcessedCells.indexOf(topEntry.cell) !== -1) {
				continue;
			}

			setCellBorderIfMissing(topEntry.cell, "border-top", topBorderValue);
			topProcessedCells.push(topEntry.cell);
		}
	}

	if (!bottomBorderValue) {
		return;
	}

	var lastRow = grid[grid.length - 1] || [];
	for (var bottomColIndex = 0; bottomColIndex < lastRow.length; bottomColIndex++) {
		var bottomEntry = lastRow[bottomColIndex];
		if (!bottomEntry || bottomProcessedCells.indexOf(bottomEntry.cell) !== -1) {
			continue;
		}

		setCellBorderIfMissing(bottomEntry.cell, "border-bottom", bottomBorderValue);
		bottomProcessedCells.push(bottomEntry.cell);
	}
}

function setCellBorderIfMissing(cell, borderKey, borderValue) {
	var styleMap = parseStyleText(cell.getAttribute("style"));
	if (!isMissingBorderValue(styleMap[borderKey])) {
		return false;
	}

	styleMap[borderKey] = stringifyBorderValue(borderValue);
	writeStyleText(cell, styleMap);
	return true;
}

function stringifyBorderValue(borderValue) {
	if (!borderValue) {
		return "";
	}

	return borderValue.width + "px " + borderValue.style + " " + borderValue.color;
}

function parsePositiveInt(value) {
	var parsed = parseInt(value, 10);
	return isNaN(parsed) || parsed < 1 ? 0 : parsed;
}

function inuixEditorDefaultSet(editorId) {
	var editor = CKEDITOR.instances[editorId];
	if (editor) {
		editor.destroy(true);
	}
	// console.log("Initializing CKEditor for:", editorId, ckeditorConfig);
	CKEDITOR.replace(editorId, window.ckeditorConfig);

	// 빈태그 자동 삭제 해제
	// CKEDITOR.dtd.$removeEmpty["i"] = false;

	// 여러 빈태그 자동 삭제 해제 ['i', 'span', 'div']
	["i", "span"].forEach((tag) => {
		CKEDITOR.dtd.$removeEmpty[tag] = false;
	});

	CKEDITOR.instances[editorId].on("instanceReady", function (event) {
		var editor = event.editor;
		editor.on("key", function (evt) {
			if (evt.data.keyCode === CKEDITOR.CTRL + 70) {
				evt.cancel();
				editor.execCommand("find");
			}
		});

		var iframe = editor.container.findOne("iframe");
		var uniqueIframeId = "preview-iframe-" + editorId;
		iframe.setAttribute("id", uniqueIframeId);
		iframe.setAttribute("class", "viewport-frame");

		// 툴바 그룹에 view_btngroup 설정
		var toolbars = editor.container.$.querySelectorAll(".cke_toolbar");
		toolbars.forEach((toolbar) => {
			var label = toolbar.querySelector(".cke_voice_label");
			if (label && label.innerText.includes("viewport")) {
				toolbar.classList.add("cke_view_btngroup");
			}
		});

		setTimeout(() => {
			$(`a[title="PC View"]`).addClass("on");
		}, 500);

		// CSS 파일 URL 설정 및 스타일시트 로더 적용
		var editorTarget = document.getElementById(editorId);
		var siteId = "neibis";
		if (editorTarget) {
			siteId = editorTarget.getAttribute("data-site-id") || "neibis";
		}

		var contextRoot = !window.CONTEXT_ROOT ? "" : "/" + window.CONTEXT_ROOT;
		var cssUrl = contextRoot + "/assets/" + siteId + "/css/style.css";
		window.cssUrls = [cssUrl]; // cssUrls 배열 초기화

		try {
			WebEditorPlugin.addExternalStylesheets(iframe.$.contentWindow, window.cssUrls);
		} catch (error) {
			console.error("Failed to add external stylesheets:", error);
		}

		editor.on("paste", function (evt) {
			var pastedHtml = evt && evt.data ? evt.data.dataValue : "";

			if (!shouldNormalizeTablePaste(pastedHtml)) {
				return;
			}

			var normalizedHtml = normalizeTablePasteHtml(pastedHtml);
			evt.data.dataValue = normalizedHtml;
		});

		// 케이스 3: 초기 데이터 로드 시 비표준 마크업 감지 (정규화 완료 후)
		editor.on("setData", function (evt) {
			var html = evt && evt.data ? evt.data.dataValue : "";
			if (typeof hasAnchorWithBlock === "function" && hasAnchorWithBlock(html)) {
				setTimeout(function () {
					alert({
						icon: "warning",
						message:
							"&lt;a&gt; 태그 안에 블록 요소가 포함되어 있어 에디터에서 마크업이 자동 재배치되었습니다.<br>&lt;a&gt; 태그 내부 요소를 인라인 요소로 변경해주세요."
					});
				}, 0);
			}
		});

		editor.on("afterPaste", function () {
			setTimeout(function () {
				repairHwpBordersInEditor(editor);
			}, 0);
		});
		
		editor.on("afterCommandExec", function (evt) {
			var cmd = evt.data.name;
			if (cmd !== "bulletedlist" && cmd !== "numberedlist") return;
		  
			setTimeout(function () {
			  var selection = editor.getSelection();
			  if (!selection) return;
		  
			  var element = selection.getStartElement();
			  if (!element) return;
		  
			  var list = element.getAscendant("ul", true) || element.getAscendant("ol", true);
			  if (!list) return;
		  
			  list.removeClass("list-editor-ul");
			  list.removeClass("list-editor-ol");
		  
			  list.addClass("list");
		  
			  var tag = (list.getName && list.getName()) ? list.getName().toLowerCase() : "";
			  if (tag === "ul") {
				list.addClass("list-editor-ul");
			  } else if (tag === "ol") {
				list.addClass("list-editor-ol");
			  }
		  
			  editor.fire("change");
			}, 0);
		  });
		  
					
	});
}

// 인스턴스 초기화 후 기본셋팅값으로 재셋팅
function resetDefaultSetEditors() {
	if (CKEDITOR.instances.ckeditor) {
		CKEDITOR.instances.ckeditor.destroy(true);
	}
	$(".inuix-ckeditor").each(function () {
		inuixEditorDefaultSet(this.id);
	});
}

function setCkEditorUplodUrl(siteId, menuSn) {
	var contextRoot = !window.CONTEXT_ROOT ? "" : "/" + window.CONTEXT_ROOT;

	resetDefaultSetEditors(); // [필수] 초기 설정 (초기 설정 재셋팅필요)
	window.CKEDITOR.config.filebrowserUploadUrl =
		contextRoot + "/neibis-api/v1/core/" + siteId + "/" + menuSn + "/file/ckeditorUpload.do?action=post"; //파일 업로드 url
	window.CKEDITOR.config.filebrowserImageUploadUrl =
		contextRoot + "/neibis-api/v1/core/" + siteId + "/" + menuSn + "/image/ckeditorUpload.do?action=post"; //이미지업로드 url
	window.CKEDITOR.config.imageUploadUrl =
		contextRoot + "/neibis-api/v1/core/" + siteId + "/" + menuSn + "/image/ckeditorUpload.do?action=post"; //이미지업로드 url
}

$(function () {
	// 기본 config 값 설정 (전역)
	window.ckeditorConfig = {
		skin: "neibis", // skin 커스텀
		customConfig: "./ckeditor.inuix.neibis_config.js", // toolbar 커스텀
		width: 100 + "%",
		// height: 100 + "%",
		keystrokes: [
			[CKEDITOR.CTRL + 70, "find"] // Ctrl+F → CKEditor 내부 검색
		],
		contentsCss: [
			// "/assets/neibis/plugins/ckeditor4/skins/neibis/ckeditor.inuix.neibis.css" // CSS editor의 기본 setting
		],
		extraAllowedContent: "ul(list,list-editor-ul,list-editor-ol);" + "ol(list,list-editor-ul,list-editor-ol);",
		justifyClasses: ["text-left", "text-center", "text-right", "text-justify"],
		//filebrowserUploadUrl: "/upload.do?type=Files", // 업로드 url
		//filebrowserImageUploadUrl: "/upload.do?type=Images", // 업로드 url

		// 플러그인
		extraPlugins:
			"colorbutton," +
			"autolink," +
			"balloontoolbar," +
			"codeTag," +
			"codesnippetgeshi," +
			"codeblock," +
			// "easyimage," +
			"format_buttons," +
			"justify," +
			"blockquote," +
			"image," +
			"emoji," +
			"forms," +
			"templates," +
			"clipboard," +
			"dialog," +
			"markdown," +
			"customviewports," +
			// "xmltemplates," +
			// "filebrowser," +
			// "filetools," +
			// "uploadfile," +
			// "uploadwidget," +
			// "notificationaggregator," +
			// "notification," +
			// "filetools," +
			// "widget," +
			// "widgetselection," +
			// "lineutils," +
			// "fakeobjects," +
			"find," +
			"tableresize," +
			"link,",

		colorButton_enableMore: false
		// codeSnippet_languages: {
		// 	javascript: "JavaScript",
		// 	php: "PHP",
		// 	html: "HTML"
		// }
		// uploadUrl: "./"
	};

	// editor.balloonToolbars.create({
	// 	buttons: "Link,Unlink,Image",
	// 	widgets: "image"
	// });

	// 로드 후 기본 인스턴스 생성
	$(".inuix-ckeditor").each(function () {
		inuixEditorDefaultSet(this.id);
	});

	// 디바이스 버튼 클릭 이벤트는 CKEditor 인스턴스 밖에 연결
	$(document).on("click", `.cke_view_btngroup .cke_toolgroup a`, function () {
		var parentGroup = $(this).closest(".cke_view_btngroup");
		parentGroup.find(".cke_toolgroup a").removeClass("on");
		$(this).addClass("on");
	});

	// CKEditor 인스턴스가 준비되면 실행
	// CKEDITOR.on("instanceReady", function (event) {
	// 	var editor = event.editor;
	// 	var iframe = editor.container.findOne("iframe");
	// 	iframe.setAttribute("id", "preview-iframe");
	// 	iframe.setAttribute("class", "viewport-frame");
	// });

	// // 코드로 수정 - 가로 사이즈에 따라 버튼 숨김 처리
	// function updateCodeItemToolsVisibility() {
	// 	var codeItemWidth = $(".code-item").width();

	// 	// 넓이가 160px 이하인 경우
	// 	if (codeItemWidth <= 160) {
	// 		$(".code-item-tools").hide();
	// 	} else {
	// 		$(".code-item-tools").show();
	// 	}
	// }

	CKEDITOR.on("dialogDefinition", function (ev) {
		var dialogName = ev.data.name;
		var dialog = ev.data.definition.dialog;
		var dialogDefinition = ev.data.definition;

		if (dialogName == "image") {
			dialog.on("show", function (obj) {
				this.selectPage("Upload"); //업로드탭으로 시작
				//dialogDefinition.removeContents('advanced'); // 자세히탭 제거
				dialogDefinition.removeContents("Link"); // 링크탭 제거
			});
		}

	});
});
