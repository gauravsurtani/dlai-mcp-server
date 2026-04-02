#!/bin/bash
# Quick MCP server test — sends handshake + tool call
# Usage: bash tests/mcp-test.sh search_courses '{"query":"RAG"}'
#        bash tests/mcp-test.sh list_topics '{}'
#        bash tests/mcp-test.sh get_course_details '{"slug":"chatgpt-prompt-engineering-for-developers"}'

TOOL=${1:-search_courses}
ARGS=${2:-'{"query":"agents"}'}

cd "$(dirname "$0")/.."

(
  echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":0}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS},\"id\":1}"
  sleep 10
) | node dist/index.js 2>/dev/null | while IFS= read -r line; do
  echo "$line" | python3 -c "
import sys, json
try:
    resp = json.loads(sys.stdin.readline())
    if resp.get('id') == 1:
        content = resp.get('result', {}).get('content', [{}])[0].get('text', '{}')
        data = json.loads(content)
        if isinstance(data, list):
            print(f'Results: {len(data)} items')
            for item in data[:5]:
                if 'title' in item:
                    print(f'  - {item[\"title\"]}')
                elif 'topic' in item:
                    print(f'  - {item[\"topic\"]}: {item[\"course_count\"]} courses')
        elif isinstance(data, dict):
            print(f'Course: {data.get(\"title\", \"?\")}')
            if 'lessons' in data:
                print(f'Lessons: {data[\"lesson_count\"]}')
                for l in data['lessons'][:5]:
                    print(f'  - {l[\"title\"]} ({l[\"duration\"]}) [{l[\"type\"]}]')
except:
    pass
" 2>/dev/null
done
