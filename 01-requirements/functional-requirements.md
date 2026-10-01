# Yêu cầu chức năng: chia chi phí và gợi ý hoàn trả

Phạm vi đã hiện thực: module tính toán. Các thao tác giao diện và API dưới đây là
yêu cầu để tích hợp sau này, chưa phải website đã hoàn thành.

1. Mỗi khoản chi cho phép chọn một hoặc nhiều người đã thanh toán và danh sách
   riêng những người chịu phần chi. Người ngoài danh sách không bị chia tiền.
2. Hỗ trợ phần chi nhập rõ số tiền, chia đều hoặc chia theo trọng số; tổng luôn
   bằng tổng hóa đơn, kể cả khi có đồng lẻ.
3. Hiển thị số dư của từng người và chi tiết khoản chi/hoàn trả tạo ra số dư đó.
4. Cho chọn hai chế độ: **Ít lần chuyển nhất** và **Gom về một người**.
5. Với chế độ ít lượt nhất, trả danh sách người gửi, người nhận, số tiền, số lượt
   và trạng thái đã/chưa chứng nhận tối ưu. Chưa chứng nhận thì hiển thị “Phương án
   gợi ý”, không khẳng định đó là số lượt nhỏ nhất.
6. Với chế độ gom, yêu cầu chọn thành viên, hiển thị hai bước thu và phân phối,
   tổng cần nhận/chuyển, phần giữ lại và phần chi vượt thu của phương án hiện tại.
   Không tự chọn người gom, không tạo một khoản chuyển từ họ đến chính họ.
7. Đổi chế độ chỉ đổi gợi ý. Giữ nguyên hóa đơn và lịch sử thanh toán đã xác nhận.
8. Cho ghi nhận hoàn trả từng phần; chỉ giao dịch được xác nhận mới ảnh hưởng số
   dư. Khi dữ liệu đổi phải tính lại gợi ý và xử lý các khoản còn chờ để tránh trả trùng.

Hợp đồng dữ liệu và ví dụ: [Hai chế độ hoàn trả](../03-architecture/settlement-modes.md).
