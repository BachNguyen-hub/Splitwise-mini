# Thiết kế hai chế độ gợi ý hoàn trả

Ngày 26/09/2026. Đã có mã JavaScript độc lập trong `src/settlement.mjs`, dùng được
ở backend Node.js 22 trở lên. Đây là bộ tính toán; chưa triển khai HTTP API hoặc
cơ sở dữ liệu, không tự chuyển tiền.

## 1. Hóa đơn riêng, số dư chung

**Danh sách thành viên nhóm không phải danh sách chia của mọi hóa đơn.** Mỗi
khoản chi có `payers` (người đã thanh toán) và `shares` (người chịu phần chi) riêng.
Chỉ người trong `shares` chịu khoản đó. Một người có thể thanh toán cho vài người,
nhiều người cùng thanh toán một khoản, hoặc thanh toán mà không dùng món/dịch vụ.

```js
const ledger = {
  memberIds: ['A', 'B', 'C', 'D', 'E'],
  expenses: [
    {
      id: 'dinner', amountMinor: 300000,
      payers: [{ memberId: 'A', amountMinor: 300000 }],
      shares: splitEqual(300000, ['A', 'B', 'C']),
    },
    {
      id: 'taxi', amountMinor: 200000,
      payers: [{ memberId: 'D', amountMinor: 200000 }],
      shares: splitEqual(200000, ['B', 'D']),
    },
  ],
  settlements: [],
};
```

| Người | Đã thanh toán | Phần phải chịu | Số dư |
|---|---:|---:|---:|
| A | 300.000đ | 100.000đ | +200.000đ |
| B | 0đ | 200.000đ | −200.000đ |
| C | 0đ | 100.000đ | −100.000đ |
| D | 200.000đ | 100.000đ | +100.000đ |
| E | 0đ | 0đ | 0đ |

Hai chế độ dùng cùng số dư này. Đổi chế độ không đổi phần tiền mỗi người phải
chịu. Phép bù trừ có thể đề xuất trả cho người không trực tiếp thanh toán hộ trong
hóa đơn gốc: C trả D là hợp lệ dù C không đi taxi. Lịch sử hóa đơn vẫn giữ nguyên.
Nếu sau này bắt buộc chỉ trả đúng người đã thanh toán hộ, cần một bài toán có
ràng buộc người gửi/người nhận riêng; đó không phải ý nghĩa của nhóm con ở đây.

## 2. Chế độ “Ít lần chuyển nhất”

Mục tiêu: mọi số dư về 0 với số giao dịch nhỏ nhất; chỉ người nợ chuyển trực tiếp
cho người được nhận, không qua trung gian. Không tối ưu phí ngân hàng/hạn mức.

Các bước: bỏ số dư 0 → ghép cặp số dư đối nhau → dùng phương án heap và kiểm tra
cận dưới → nếu chưa chứng nhận, giải bằng DP khi phần còn lại tối đa 20 người.
Chứng minh và công thức DP có trong [tài liệu thuật toán](settlement-algorithm.md#5-thuật-toán-chính-xác).

- Mặc định nhóm tối đa 20 người còn công nợ luôn nhận nghiệm chính xác.
- Nhóm lớn hơn cũng có thể chính xác nếu ghép cặp làm phần còn lại đủ nhỏ hoặc
  phương án đạt cận dưới. Không có lời hứa tối ưu mọi nhóm lớn trong thời gian ngắn.
- Nếu phần còn lại quá lớn và chưa chứng nhận, trả `optimal: false`; vẫn bảo toàn
  từng đồng và thanh toán hết công nợ. `lowerBound` là cận dưới đã chứng minh.
- `optimal: true` và `optimalityScope: 'group'` nghĩa là cực tiểu toàn nhóm.
- Bảng DP tối đa khoảng 10 MiB; thời gian `O(r × 2^r)` với `r ≤ 20`. Ngoài DP,
  chuẩn hóa/sắp thứ tự/heap là `O(n log n)`; không tạo ma trận nợ mọi cặp người.

Ví dụ trên chỉ cần **2 lượt**: B → A 200.000đ; C → D 100.000đ. Đây là cực tiểu vì
có hai người nợ và hai người được nhận, không thể chỉ dùng một lượt.

## 3. Chế độ “Gom về một người”

Người dùng chọn `collectorId` là một thành viên trong nhóm. Gọi số dư người đó là
`bH`, số người có số dư khác 0 là `n`. Không tự chọn người gom và không yêu cầu họ
phải là người đã thanh toán nhiều nhất.

Với mỗi người khác người gom:

1. Số dư âm: chuyển toàn bộ phần còn nợ cho người gom.
2. Số dư dương: nhận toàn bộ phần được nhận từ người gom.
3. Số dư 0: không tạo giao dịch.

Số lượt chính xác là `n − 1` nếu `bH ≠ 0`, hoặc `n` nếu `bH = 0`. Khi mọi người
đã cân bằng, số lượt là 0. Mỗi người khác người gom có công nợ bắt buộc cần một
giao dịch; phương án đạt đúng cận dưới đó, nên tối ưu với người gom đã chọn.

`optimal: true` đi cùng `optimalityScope: 'selected-collector'`. Không diễn giải
thành ít lượt nhất toàn nhóm. Chọn người gom có số dư 0 có thể thêm một lượt so
với chọn người còn công nợ. Không tự đổi người dùng đã chọn để giảm một lượt.

Chi phí dựng phương án `O(n)` sau khi đã có số dư sắp thứ tự. Hàm công khai gồm
kiểm tra và sắp ID nên tổng thời gian `O(n log n)`, bộ nhớ `O(n)`.

### Thu trước, phân phối sau

Kết quả có `phases`: `collect` rồi `distribute`; `transfers` là danh sách hai bước
nối theo đúng thứ tự. Bên trong mỗi bước sắp theo ID, ổn định dù đổi thứ tự đầu vào.
Các giao dịch của mỗi bước có thể thực hiện độc lập, nhưng chỉ phân phối khi đã
có đủ tiền thực tế. Trạng thái xác nhận trong sổ không thay thế kiểm tra ngân hàng.

| Số dư người gom | Xử lý | Ví dụ trong nhóm 5 người |
|---|---|---|
| Dương | Thu, chuyển cho những người được nhận khác, giữ lại phần của mình | Chọn A: nhận 300.000đ, chuyển D 100.000đ, giữ 200.000đ; 3 lượt |
| Âm | Thu, bảo đảm phần chi vượt thu, rồi phân phối | Chọn B: nhận C 100.000đ, chuyển A 200.000đ và D 100.000đ; phần chi vượt thu 200.000đ; 3 lượt |
| Bằng 0 | Nhận bao nhiêu phân phối bấy nhiêu | Chọn E: nhận 300.000đ, chuyển 300.000đ; 4 lượt |

Không tạo giao dịch người gom chuyển cho chính họ. Bất biến:

```text
receiveMinor + fundingRequiredMinor = sendMinor + keepMinor
receiveMinor − sendMinor = balanceMinor của người gom
```

`fundingRequiredMinor` là phần cần chi vượt khoản **thu còn lại trong phương án
hiện tại**, không luôn là tiền cá nhân phải bỏ thêm. Ví dụ chọn A, B đã chuyển
200.000đ và được xác nhận: số dư A trở thành 0; còn thu C 100.000đ rồi trả D.
Nếu B và C đều đã chuyển, số dư A thành −100.000đ; A cần trả D 100.000đ đang giữ
cho nhóm. Không yêu cầu A bỏ thêm 100.000đ cá nhân chỉ vì số dư hiện tại âm.

## 4. Hợp đồng dùng từ backend

```js
import {
  splitEqual, calculateBalances, suggestSettlements,
} from './src/settlement.mjs';

// ledger theo ví dụ phần 1, hoặc bản sổ đọc nhất quán từ cơ sở dữ liệu.
const balances = calculateBalances(ledger);
const direct = suggestSettlements(balances, { mode: 'min-transfers' });
const collected = suggestSettlements(balances, {
  mode: 'collector', collectorId: 'A',
});
```

Điểm vào trực tiếp tương đương: `optimizeSettlements(balances, options)` và
`collectSettlements(balances, { collectorId })`. Mặc định điểm vào chung chọn
`min-transfers`; chế độ gom bắt buộc có ID người gom hợp lệ, kể cả khi sổ đã cân
bằng. Không cho phép tùy chọn người gom ở chế độ trực tiếp hoặc ngưỡng DP ở chế độ gom.

| Trường trả về | Ý nghĩa |
|---|---|
| `mode`, `transfers`, `transactionCount` | Chế độ, các dòng `{from, to, amountMinor}`, tổng lượt |
| `activeMembers` | Số thành viên có số dư khác 0, không phải tổng thành viên nhóm |
| `optimal`, `optimalityScope` | Có chứng nhận tối ưu hay chưa, trong phạm vi nào |
| `method`, `proof`, `lowerBound` | Cách giải, loại chứng minh, cận dưới trong phạm vi đó |
| `pairedMembers`, `remainingMembers` | Chế độ trực tiếp: số người được ghép cặp và phần còn lại trước DP/heap |
| `collectorId`, `phases` | Chế độ gom: người gom và hai bước thu/phân phối |
| `collector.balanceMinor` | Số dư người gom trong bản sổ dùng tính phương án |
| `collector.receiveMinor`, `collector.sendMinor` | Tổng thu và tổng chuyển còn lại |
| `collector.fundingRequiredMinor`, `collector.keepMinor` | Phần chi vượt thu; phần giữ lại |

Mọi số tiền công khai là số nguyên an toàn, VND tính bằng đồng. Nội bộ dùng
`BigInt` cho tích và cộng tiền. Không cộng `receiveMinor + sendMinor` bằng `Number`
để làm tổng luân chuyển: tổng này có thể vượt giới hạn dù mỗi tổng riêng hợp lệ.
Dữ liệu sai bị từ chối bằng `RangeError` (ví dụ ID lạ/trùng, số dư không tổng 0,
tổng phần chi khác hóa đơn, số tiền không nguyên, chế độ không hợp lệ). Lớp API
cần kiểm tra cả cấu trúc yêu cầu và trả lỗi dễ hiểu, không lộ lỗi nội bộ.

### Ghi nhận giao dịch và thay đổi chế độ

- Đọc hóa đơn/phần chi/hoàn trả đã xác nhận cùng một phiên bản sổ. Trả kế hoạch
  cùng `ledgerVersion`; đây là trách nhiệm lớp API, module không tự quản lý phiên bản.
- Chỉ `confirmed` thay đổi số dư. Giữ giao dịch thật với ID duy nhất, xác minh
  quyền và cập nhật nguyên tử; dùng cơ chế chống ghi trùng ở cơ sở dữ liệu.
- Có trả từng phần hoặc thêm/sửa hóa đơn: tính lại từ sổ. Không tái sử dụng các
  dòng chưa thực hiện của một phương án cũ khi sổ đã đổi.
- Đổi người gom hoặc đổi chế độ sau khi đã chuyển một phần vẫn tính đúng nếu
  giữ toàn bộ giao dịch đã xác nhận. Khoản đang chờ cần được xử lý/hiển thị riêng
  trước khi hướng dẫn trả tiếp để tránh trả trùng.
- Không đánh dấu mọi dòng trong phương án là đã trả. Đây chỉ là đề xuất, không
  phải bằng chứng chuyển tiền và không phải API ngân hàng.

## 5. Chạy và kiểm chứng

`npm test` chạy kiểm thử tiền, tối ưu trực tiếp và người gom. `npm run demo` chạy
các ví dụ 3, 5, 6 và 20 người; nhóm 5 người minh họa đúng việc hóa đơn chỉ chia cho
nhóm con. `npm run benchmark` đo riêng hai chế độ với nhóm 6, 20 và 200 người.

Các kiểm thử mới kiểm tra bảo toàn tiền, người gom có đủ ba dấu số dư, người ngoài
khoản chi, xác nhận từng phần, thứ tự ổn định, giới hạn số nguyên, phương án sau
xác nhận đưa toàn bộ số dư về 0 và đối chiếu tối ưu với phép tìm kiếm độc lập.

Kết quả ngày 26/09/2026: **38/38 kiểm thử đạt** qua `npm test`. Các trường hợp mới
trong `tests/settlement-modes.test.mjs` có quy mô như sau. “Người trong nhóm” bao
gồm người số dư 0; không đồng nghĩa số người chia mỗi hóa đơn hoặc số lượt chuyển.

| Kiểm thử mới | Người trong nhóm | Phạm vi |
|---|---:|---|
| Hóa đơn chia cho nhóm con | 5 | Hai hóa đơn cho 3 người và 2 người; E không tham gia |
| Người gom được nhận | 5 | Chọn A, 3 lượt |
| Người gom đang nợ | 5 | Chọn B, 3 lượt |
| Người gom không có công nợ | 5 | Chọn E, 4 lượt |
| Mọi người đã cân bằng | 1 và 5 | Không tạo giao dịch |
| Từ chối dữ liệu sai | 0–4 dòng số dư | Gồm nhóm rỗng, ID trùng/lạ và dữ liệu không hợp lệ |
| Số tiền sát giới hạn | 3 | Thử cả ba người làm người gom |
| Thứ tự ổn định, không sửa đầu vào | 5 | Đổi thứ tự và khóa dữ liệu đầu vào |
| Chọn chế độ và kiểm tra tùy chọn | 3 | Hai chế độ và tùy chọn không hợp lệ |
| Xác nhận thu từng phần | 5 | Tính tiếp phần còn lại, xử lý tiền người gom đang giữ |
| Đối chiếu tối ưu độc lập | 300 bộ, tối đa 9 người/bộ | Thử cả bật và tắt ghép cặp |
| Rút gọn nhóm lớn | 206 | 101 cặp, còn 4 người để giải bằng DP |
| Chứng minh bằng cận dưới | 51 | 1 người nợ, 50 người được nhận |
| Phương án lớn chưa chứng nhận | 25 | Không khẳng định tối ưu khi chưa có chứng minh |
| Nhiều hóa đơn nhóm con | 20 | 19 hóa đơn cho 2–5 người/khoản; thử cả 20 người làm người gom |

Trong trường hợp cuối, có 5 hóa đơn chia cho 2 người, 5 cho 3 người, 5 cho 4 người
và 4 cho 5 người. Người thanh toán không nằm trong danh sách chịu phần chi của
chính khoản đó; P20 không tham gia khoản nào. Cả phương án trực tiếp và 20 phương
án chọn người gom đều được ghi nhận hoàn tất để kiểm tra toàn bộ số dư về 0.
