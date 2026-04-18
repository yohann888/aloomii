/* ── Pagination ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
  flex-wrap: wrap;
}
.pagination-btn {
  background: #009e96;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity .2s;
}
.pagination-btn:hover { opacity: .85; }
.pagination-btn:disabled { opacity: .4; cursor: not-allowed; }
.pagination-info { font-size: 14px; color: #666; font-family: Inter, sans-serif; }
@media (max-width: 600px) {
  .pagination { gap: 10px; }
  .pagination-btn { padding: 8px 14px; font-size: 13px; }
}