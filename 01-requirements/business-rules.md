# Quy tắc tính tiền cho Splitwise-mini

Các quy tắc dưới đây là thiết kế đã hiện thực trong module toán; quyền truy cập,
lưu trữ và luồng xác nhận cần được triển khai khi xây API/giao diện.

1. Thành viên được định danh bằng ID duy nhất; không dùng tên hiển thị để gộp người.
2. Một nhóm dùng một đơn vị tiền. Không cộng trực tiếp nhiều loại tiền khác nhau.
3. Khoản chi có tổng tiền dương, ít nhất một người đã thanh toán và một người chịu
   phần chi. Tổng đã thanh toán và tổng phần chi đều phải bằng tổng tiền của khoản đó.
4. Người đã thanh toán có thể không dùng món/dịch vụ. Các khoản có thể chia cho những tập
   thành viên khác nhau; không bắt buộc chia toàn bộ nhóm.
5. Tiền dùng số nguyên ở đơn vị nhỏ nhất. Chia đều hoặc theo trọng số phải phân bổ
   hết phần dư, không làm mất hoặc tự thêm tiền. Khi phần dư bằng nhau, ưu tiên ID
   tăng dần; lưu kết quả phân bổ cùng khoản chi.
6. Số dư = đã thanh toán − phần phải chịu + đã hoàn trả được xác nhận − đã nhận hoàn trả
   được xác nhận. Số dư dương được nhận, âm cần trả; tổng toàn nhóm bằng 0.
7. Khoản chờ xác nhận hoặc bị từ chối chưa làm thay đổi số dư. Chỉ ghi giao dịch
   thực tế đã được xác nhận; phương án gợi ý không phải bằng chứng thanh toán.
8. Mỗi khoản chi và mỗi lần hoàn trả phải có ID duy nhất trong sổ. API phải chống
   ghi lặp, kiểm tra quyền xác nhận và lưu trạng thái một cách nguyên tử.
9. Được hoàn trả từng phần. Khoản trả thừa đã được xác nhận phải được phản ánh
   đúng trong số dư, không âm thầm bỏ phần thừa.
10. Có thể bù trừ công nợ cả nhóm: người thiếu chuyển cho bất kỳ người dư nào trong
    nhóm. Giữ lịch sử hóa đơn để giải thích vì sao có số dư đó.
11. Chế độ ít lượt nhất ghép các cặp số dư đối nhau rồi giải chính xác khi phần
    còn lại có tối đa 20 người. Với nhóm lớn hơn, chỉ chứng nhận tối ưu khi có
    chứng minh bằng cận dưới; trường hợp khác ghi rõ chưa chứng nhận.
12. Khi khoản chi hoặc thanh toán thay đổi, phương án cũ phải được tính lại. Các
    giao dịch đã xác nhận vẫn giữ trong sổ; không được mất đi khi tạo phương án mới.
13. Chế độ gom về một người yêu cầu chọn một thành viên có trong nhóm. Người nợ
    chuyển cho người gom; người gom chuyển cho người được nhận. Người gom có thể
    đang nợ, được nhận hoặc có số dư bằng 0; không tạo giao dịch với chính mình.
14. Mỗi người khác người gom có số dư khác 0 tham gia đúng một lượt. Thu trước,
    phân phối sau; phần cần chi vượt thu phải được người gom bảo đảm. Nếu đã thu
    một phần, khoản này có thể là tiền nhóm người gom đang giữ.
15. `optimal` phải đi cùng phạm vi: toàn nhóm ở chế độ trực tiếp, hoặc người gom
    đã chọn ở chế độ gom. Không quảng bá số lượt qua người gom là cực tiểu toàn nhóm.

Chi tiết và giới hạn: [Thuật toán hoàn tiền](../03-architecture/settlement-algorithm.md).
