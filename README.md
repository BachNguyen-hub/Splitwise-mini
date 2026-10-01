# Splitwise-mini

Chia chi phí nhóm, tính số dư và đề xuất ai cần chuyển tiền cho ai.

Hiện có module thuật toán độc lập bằng JavaScript, chưa có giao diện website,
API hay cơ sở dữ liệu. Không cần cài thư viện ngoài; dùng Node.js 22 trở lên.

```text
npm test
npm run demo
npm run benchmark
```

- [Module tính tiền](src/settlement.mjs): chia đều, chia theo trọng số, tính số dư
  có hoàn trả, **ít lần chuyển nhất** và **gom về một người**.
- [Thiết kế hai chế độ và cách gọi từ backend](03-architecture/settlement-modes.md).
- [Ví dụ nhóm 20 người](examples/settlement-demo.mjs): mỗi người đều thanh toán một khoản,
  tổng chi 10 triệu đồng, sau hoàn trả mọi số dư bằng 0.
- [Quy tắc nghiệp vụ](01-requirements/business-rules.md).
- [Phân tích website tham khảo, chứng minh thuật toán và hướng dẫn tích hợp](03-architecture/settlement-algorithm.md).
- [Kết quả kiểm tra chiahoadon.com sau đăng nhập ngày 26/09/2026](03-architecture/chiahoadon-audit-2026-09-26.md).
- [Bộ kiểm thử](tests/run.mjs).

Mỗi hóa đơn có danh sách người chịu phần chi riêng, không mặc định chia cả nhóm.
Chế độ ít lượt nhất ghép các cặp số dư đối nhau, rồi giải chính xác khi còn tối đa
20 người. Nhóm lớn hơn vẫn được chứng nhận nếu đạt cận dưới; trường hợp chưa chứng
nhận trả `optimal: false`. Dùng một loại tiền và cho phép bù trừ trong nhóm.

Chế độ gom qua một người do người dùng chọn cần đúng một lượt cho mỗi người khác
còn công nợ. Kết quả tách bước thu và bước phân phối; bảo đảm ít lượt trong điều
kiện mọi lượt đi qua người gom, không đồng nghĩa ít lượt nhất của toàn nhóm.

Chỉ tạo đề xuất và tính toán. Việc lưu giao dịch, xác nhận người dùng và chuyển
tiền thực tế thuộc phần website cần xây tiếp.
