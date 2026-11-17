# /pharmacy demo data: credits and licences

## DGS sign videos (dgs/*.mp4) and their skeletons (dgs/dgs.json)
From SignDict (https://signdict.org), a community DGS dictionary; most videos originate from Wikisign DGS (dgs.wikisign.org).
Only videos marked CC BY-SA 3.0 DE or CC BY 4.0 are used. The skeletons in dgs.json are MediaPipe landmarks computed from these
videos by Hands Up; as adaptations of CC BY-SA videos they are shared under the same licence (CC BY-SA 3.0 DE) with the same credit.

| Gloss | Sign shown | File | Source | Credit | Licence | SHA-256 |
|---|---|---|---|---|---|---|
| HALLO | HALLO | dgs/HALLO.mp4 | https://signdict.org/entry/293-hallo/video/332 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `8f303bd0ccd6dd145a8c80f5bd0c0dceeb1a37f84e4171c64766170c7e593e71` |
| ICH | SELBST (stand-in) | dgs/ICH.mp4 | https://signdict.org/entry/657-selbst/video/747 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `e67c7e8f04117fb3a3e3088bf8933e4c1fd86bc191ae66232b84212d4b2e644e` |
| ARZT | ARZT | dgs/ARZT.mp4 | https://signdict.org/entry/48-arzt/video/50 | Marco - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `288b66ad3cfb1e19fa1b9192e7c6c84225dd5ab442ed868b02f4799a41b5fb67` |
| GEHEN | GEHEN | dgs/GEHEN.mp4 | https://signdict.org/entry/3839-gehen/video/4299 | Bodo Tasche | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0) | `66d3252b067590c44aa4ad9401e20616a00b4392cd8a339cab8c773281bcfcd7` |
| DEUTSCH | DEUTSCHLAND (stand-in) | dgs/DEUTSCH.mp4 | https://signdict.org/entry/149-deutschland/video/167 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `d3199690aa7992defdba98981bc938ea308319bff5a4b9fa4171fef5536ee5a7` |
| KANN-NICHT | KANN-NICHT | dgs/KANN-NICHT.mp4 | https://signdict.org/entry/388-kann-nicht/video/436 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `37cad005c8702ab463686ccc1ff035d8e9dc6fa01a6cb77d90165accb0564310` |
| BITTE | BITTE | dgs/BITTE.mp4 | https://signdict.org/entry/111-bitte/video/122 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `2102cf4528f7ba72ea5adb0ecf8ec8cb01119ee864ca09bf83346636ee26f4b3` |
| MEDIKAMENT | MEDIKAMENT | dgs/MEDIKAMENT.mp4 | https://signdict.org/entry/482-medikament/video/544 | 134.130.170.99 - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `68c3a8481dc7b681f79c820daeea2f4781bf7317e0202be040bf8b514c647b7a` |
| ZWEI | 2 | dgs/ZWEI.mp4 | https://signdict.org/entry/838-2/video/955 | Ajoannis - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `26a52261dfa3a00d597e7a637ae00515b97466786a82d1d182428d34c4466c6e` |
| WOCHE | WOCHE | dgs/WOCHE.mp4 | https://signdict.org/entry/815-woche/video/926 | 134.130.170.112 - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `d90cb62e3ec8460cfb7784ef99c96e00114295aec6bc8e83e32bc17fb017f023` |
| VERSTEHEN | VERSTEHEN | dgs/VERSTEHEN.mp4 | https://signdict.org/entry/3561-verstehen/video/874 | 134.130.170.112 - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `9d132a88fdaa0452dbd4ce637125348304cd18a86a11ff8bbe9cd849b65039f9` |
| DANKE | DANKE | dgs/DANKE.mp4 | https://signdict.org/entry/1360-danke/video/151 | Philipps - dgs.wikisign.org - Wikisign DGS | [CC BY-SA 3.0 DE](http://creativecommons.org/licenses/by-sa/3.0/de) | `5d65bd39f32bc6cca228eac5f5a6d9b773749c9ca4b1cb6b3ec6635922450907` |

Glosses with no openly licensed video are shown as text cards ("Gebärde folgt"): KOPF, SCHMERZ, HIER, REZEPT, LESEN, HELFEN, ZEIGEN, DREI-MAL, TAG, NACH, ESSEN, FÜNF, EURO, HILFE.

## ASL sign skeletons (signs.json)
PopSign ASL v1.0, Georgia Tech, CC BY 4.0 (https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/). Pose and hand landmarks only
(MediaPipe), no video, no face mesh. Built by scripts/build-pharmacy-signs.mjs.

## SHA-256
- signs.json: `c0587f91122b49a288d2128b3f449cb31881d0e0c791826ff8143831956f7582`
- dgs/dgs.json: `55c815116b9548ff32ed8be7a48bb8b66e783162669eb07c1f226c4da7d259a4`
