#!/bin/bash
set -e

echo "============================================"
echo "     FoxPOS PoC Health Check"
echo "============================================"
echo ""

echo "== Port check =="
for p in 5173 5181 5186; do
  if lsof -i :$p >/dev/null 2>&1; then
    echo "  OK  port $p"
  else
    echo "  FAIL port $p"
  fi
done

# 8100 is Docker container (foxpos-backend), lsof cannot detect it
res=$(curl -fsS http://127.0.0.1:8100/health 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>&1) && echo "  OK  backend 8100 health ($res)" || echo "  FAIL backend 8100"

echo ""
echo "== HTTP check =="
res=$(curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:5181/ 2>&1) && echo "  OK  5181 ($res)" || echo "  FAIL 5181"
res=$(curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:5186/index.mobile.html 2>&1) && echo "  OK  5186 ($res)" || echo "  FAIL 5186"
res=$(curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/mockup/pos-shell.html 2>&1) && echo "  OK  5173 ($res)" || echo "  FAIL 5173"

echo ""
echo "== API proxy check =="
res=$(curl -fsS "http://127.0.0.1:5181/api/v1/orders/POC_010/options" \
  -H "X-User-Role: store_owner" \
  -H "X-Store-Id: POC_010" 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',{}).get('options',[])))" 2>&1) && echo "  OK  orders options=$res" || echo "  FAIL orders"

res=$(curl -fsS "http://127.0.0.1:5181/api/v1/dashboard/production?store_id=POC_010" \
  -H "X-User-Role: store_owner" \
  -H "X-Store-Id: POC_010" 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',{}).get('items',[])))" 2>&1) && echo "  OK  production count=$res" || echo "  FAIL production"

echo ""
echo "== pm2 status =="
pm2 list 2>&1

echo ""
echo "== Done =="
