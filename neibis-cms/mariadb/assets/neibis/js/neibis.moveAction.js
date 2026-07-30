/**
 *  상세페이지로 이동
 */
var submitToDetail = function(...inputs){
	getActionForm("detail.do",...inputs);
}

/**
 * 수정페이지로 이동
 */
var submitToUpdtPage = function(...inputs){
	getActionForm("updt.do",...inputs);
}

/**
 *  등록페이지로 이동
 */
var submitToSavePage = function(...inputs){
	getActionForm("save.do",...inputs);
}

/**
 * 수정페이지로 이동 - 답글
 */
var submitToRplyPage = function(...inputs){
	getActionForm("rply.do",...inputs);
}



/*
* (공통) 페이지 이동시 신규 폼 생성하여 파라미터 추가하고 이동 및 삭제처리
* 뒤로가기, 새로고침시 오류나는 부분대응
*/
function getActionForm(action, ...inputs){
    let form = $('<form>', {
        action: action, // 제출할 URL 설정
        method: 'POST', // 제출 방식 설정
      });

     // 모든 입력 필드 처리
    inputs.forEach(input => {
        if(input) form.append(input);
    });

   	// 폼을 문서에 추가하고 제출
    form.appendTo('body').submit();
   	// 폼 삭제
   	form.remove();

}

/*
* (공통) linkPage값을 input으로 변환하여 돌려줌
*  해당 함수호출 코드는 TOP쪽에 공통으로 설정해놓음
*/
function parseLinkPageAndCreateInputs(linkPage) {
	 // linkPage 값이 빈 문자열이거나 null/undefined인 경우 빈 배열 반환
    if (!linkPage) {
        return [];
    }

 	// HTML 엔티티가 두 번 인코딩된 상태를 정상적인 '&'로 디코딩
    var decodedLinkPage = linkPage.replace(/&amp;amp;/g, '&');


    // 디코딩된 문자열을 파싱하여 파라미터 객체 배열 생성
    var params = decodedLinkPage.split("&").map(function(param) {
        var parts = param.split("=");
        return {
            name: decodeURIComponent(parts[0]),
            value: decodeURIComponent(parts[1] || '')
        };
    });

    // 파라미터 객체 배열을 바탕으로 입력 필드 생성
    var inputs = params.map(function(param) {
        return $("<input>").attr("type", "hidden").attr("name", param.name).val(param.value);
    });

    return inputs;
}

/*
* (공통) paramList값을 input으로 변환하여 돌려줌
*  해당 함수호출 코드는 TOP쪽에 공통으로 설정해놓음
*/
function parseParamListAndCreateInputs(paramList) {
	 // linkPage 값이 빈 문자열이거나 null/undefined인 경우 빈 배열 반환
    if (!paramList) {
        return [];
    }

	var inputs = paramList.map(function(param) {
    // jQuery를 사용하여 hidden 입력 필드 생성
    return $("<input>")
        .attr("type", "hidden")
        .attr("name", param.paramNm)
        .val(param.paramVl);
	});

    return inputs;
}





