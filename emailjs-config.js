// EmailJS 설정값 - https://www.emailjs.com 대시보드에서 발급받은 값으로 채워주세요.
// 알림 수신 주소(ohchaewoo2012@gmail.com)는 여기가 아니라 EmailJS 대시보드의
// Email Templates > 해당 템플릿 > "To Email" 항목에 입력해야 합니다. (보안상 클라이언트 코드에는 넣지 않음)
const EMAILJS_PUBLIC_KEY = "DzMiI81kMuJWxsI5j";
const EMAILJS_SERVICE_ID = "service_mux59h6";
const EMAILJS_TEMPLATE_ID = "template_f0yk8ef";

if (typeof emailjs !== "undefined" && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}
