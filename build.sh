#!/bin/bash
cd "$(dirname "$0")/src"
OUT=../minecraft2.html
cat head.html > $OUT
for f in a_core.js b_blocks.js c_world.js d_mesh.js; do echo "// ===== $f" >> $OUT; cat $f >> $OUT; echo >> $OUT; done
echo "</script>" >> $OUT
echo "<script>" >> $OUT
for f in d2_worker.js e_render.js f_entities.js f2_models.js g_game.js g2_play.js h_net.js i_main.js; do echo "// ===== $f" >> $OUT; cat $f >> $OUT; echo >> $OUT; done
echo "</script></body></html>" >> $OUT
wc -c $OUT
