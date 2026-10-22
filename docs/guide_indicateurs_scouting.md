# Grille de scouting — NZ Talent Radar

Dernière vérification : 22 octobre 2026. Première proposition, à tester sur des matches réels avant de publier des notes.

## L'idée

Comparer les joueurs néo-zélandais **dans leur poste et leur contexte de compétition**, pas sur un nombre brut de buts ou une moyenne Sorare globale. Les profils sont hétérogènes (hommes/femmes, jeunes/pros, pays différents). Une absence de données n'est jamais une performance nulle.

## 1. Sources, données et limites

| Source | Données observables | Ce qu'on en fait | Limites |
| --- | --- | --- | --- |
| **Sorare — profil** | slug, âge, poste, club, national team, blessures/suspensions signalées, compétition | identité, contexte, disponibilité | couverture variable selon championnat ; l'identité doit rester confirmée |
| **Sorare — `Player.stats(seasonStartYear)`** | apparitions, minutes, buts, passes décisives, cartons | volume et saison | ne remplace pas les données match par match |
| **Sorare — `Player.allPlayerGameScores` / `playerGameScores`** | date, score, version du scoring, statut et détail par match | régularité, forme récente, évolution | scores de fantasy influencés par les règles ; distinguer matchs joués et DNP |
| **Sorare — `PlayerGameStats`** | minutes, buts, assists, tirs, duels, interceptions, tacles, passes, erreurs, arrêts, etc. | indicateurs de scouting par poste | certains champs nuls, couverture « low coverage », collecte à tester sur chaque compétition |
| **Understat — joueur/saison** | minutes, matches, xG, npxG, xA, xGChain, xGBuildup, key passes | menace offensive et contribution à la construction | surtout 6 championnats masculins historiques ; pas exhaustif pour les NZ |
| **Understat — tirs** | X/Y (0..1), xG, minute, situation, pied/tête, résultat, match | carte de tirs, zones, qualité des tirs et finition | X/Y décrit seulement **la position du tireur**, ni passes ni courses |

Sources :
- Schéma GraphQL Sorare : https://api.sorare.com/graphql/schema
- Documentation Sorare : https://github.com/sorare/api
- Référence Understat (API non officielle, champs et ligues) : https://github.com/withqwerty/football-docs/blob/main/docs/free-sources/understat.md
- Exemple de schéma agrégé Understat : https://github.com/vibedatascience/understat_players_aggregated

**Ce que nous avons aujourd'hui (snapshot du 22/10/2026) :** 1 111 profils NZ liés, 48 correspondances Sorare confirmées ; 0 joueur et 0 tir Understat importés. Les scripts existants font du matching d'identité et de l'import de tirs, **pas encore** un classement de performance. Ne pas afficher de Top 10 « meilleur joueur » tant qu'aucune statistique n'est sourcée.

## 2. Colonnes à demander à Sorare en premier

Des champs du **schéma Sorare actuel**, pas des garanties de valeurs pour tous les joueurs.

- Commun : `minsPlayed`, `gameStarted`, `onGameSheet`, `playedInGame`, `passAccuracy`, `totalPass`, `accuratePass`, `possWon`, `possLostCtrl`, `fouls`.
- Défense : `interceptionWon`, `wonTackle`, `totalTackle`, `duelWon`, `duelLost`, `effectiveClearance`, `errorLeadToShot`, `errorLeadToGoal`.
- Construction / création : `successfulFinalThirdPasses`, `penAreaEntries`, `bigChanceCreated`, `wonContest`, `accurateLongBalls`, `goalAssist`.
- Finition : `goals`, `totalScoringAtt`, `ontargetScoringAtt`, `bigChanceMissed`, `attPenGoal`, `penaltyTaken`.
- Gardien : `saves`, `goalsConceded`, `goodHighClaim`, `accurateKeeperSweeper`, `penaltiesSaved`, `cleanSheet`, `errorLeadToGoal`.
- Score : sur `PlayerGameScore`, `score`, `scoringVersion`, `scoreStatus`, `allAroundScore`, `detailedScore`, `footballGame.date` et `footballGame.lowCoverage`.

Ne pas confondre `passAccuracy` (valeur fournie par Sorare à contrôler en pratique) avec `accuratePass / totalPass` (taux calculable). Les composantes du score Sorare changent avec `scoringVersion`. Comparer une même version seulement.

## 3. Indicateurs prioritaires par poste

Les pondérations suivantes sont **des hypothèses de départ**, pas un modèle validé. Chaque bloc totalise 100 %. Les valeurs doivent être ramenées à un contexte cohérent (poste / championnat / saison / sexe / minutes).

| Poste | Indicateurs prioritaires | Pondération interne envisagée |
| --- | --- | --- |
| **Gardien** | taux d'arrêts approximatif, erreurs, sorties aériennes, interventions hors surface, distribution, clean sheets | 25 / 20 / 15 / 15 / 15 / 10 |
| **Défenseur central** | duels gagnés, tacles + interceptions, erreurs, passes / relance, dégagements | 25 / 25 / 20 / 20 / 10 |
| **Latéral / piston** | récupérations et tacles, passes vers dernier tiers, réussite des passes, duels, occasions créées / centres | 25 / 25 / 20 / 15 / 15 |
| **Milieu défensif** | récupérations, duels, sécurité du ballon, jeu vers l'avant, fautes / erreurs | 30 / 25 / 20 / 15 / 10 |
| **Milieu relayeur** | passes vers dernier tiers, récupérations, maîtrise du ballon, xA (si disponible), occasions créées | 30 / 20 / 25 / 15 / 10 |
| **Milieu offensif** | xA, grosses occasions créées, progression dans le dernier tiers, xGChain, npxG | 30 / 20 / 15 / 20 / 15 |
| **Ailier** | xA, dribbles réussis, npxG, qualité des positions de tirs X/Y, passes vers l'avant | 25 / 20 / 20 / 15 / 20 |
| **Avant-centre** | npxG, buts sans penalty vs npxG (sur échantillon suffisant), qualité moyenne de tir, tirs/90, occasions ratées, participation aux actions | 35 / 15 / 15 / 15 / 10 / 10 |

Précisions utiles :

- **Gardien** : `saves / (saves + goalsConceded)` peut donner un taux d'arrêts **approximatif** ; il ne remplace pas le post-shot xG. Une clean sheet dépend aussi de l'équipe.
- **Défenseur** : un grand total de dégagements reflète parfois une équipe dominée ; ne pas en faire une prime automatique.
- **Milieu** : préférer la combinaison « conservation + progression » à la seule précision des passes.
- **Ailier** : `wonContest` est un proxy de dribble ; les X/Y d'Understat localisent **ses propres tirs**, pas ses dribbles.
- **Buteur** : `npxG` exclut les penalties, ce qui facilite la comparaison des occasions obtenues ; `goals - xG` seul est très instable sur quelques matchs.
- **Profil polyvalent** : afficher plusieurs sous-postes si justifiés par les feuilles de match. Le poste Wikidata est trop général pour distinguer un 6, un 8 et un 10.

## 4. Formules reproductibles

Pour une même période et **les mêmes matches couverts** :

- `actions_p90 = 90 * actions / minutes` ; ne calculer que si minutes > 0.
- `duel_success = duelWon / (duelWon + duelLost)` si le dénominateur est > 0.
- `pass_success = accuratePass / totalPass` si le dénominateur est > 0.
- `npxg = somme(xg des tirs dont situation != Penalty)`.
- `npxg_per_shot = npxg / tirs_sans_penalty` si > 0.
- `goal_minus_npxg = buts_hors_penalty - npxg` ; seulement comme indice descriptif, pas un « talent de finition » certain.
- `xg_shot = somme(xg) / nb_tirs`.
- `xg_chain_p90 = 90 * xGChain / minutes_Understat` quand les deux portent sur la même saison.
- `xg_buildup_p90 = 90 * xGBuildup / minutes_Understat`.
- `in_box_share` : part des tirs dans une zone de surface clairement définie en coordonnées normalisées ; c'est une approximation spatiale, pas une mesure des touches de balle dans la surface.
- `start_rate` : titularisations / matches où le joueur apparaît sur la feuille, avec définition du dénominateur affichée.
- `score_volatility` : écart-type des scores sur les **matches joués et évalués**, même version du scoring et sans match non couvert.

Les tirs Understat normalisent X/Y de 0 à 1, vers le but adverse (x croissant). Filtrer `situation == Penalty` avant toute mesure « hors penalty ». Un tir de penalty ne représente pas une création d'occasion comparable.

## 5. Comment produire un classement juste

### Un seul socle, puis des profils

Un **indice de forme** (30 %) : disponibilité et temps de jeu (15 %), régularité sur les matches évalués (15 %).

Un **indice de qualité par poste** (70 %) : moyenne pondérée des percentiles de la grille ci-dessus. Chaque percentile doit être calculé par rapport à un groupe de référence raisonnable : même sous-poste, même sexe, championnat/saison (ou niveau comparé avec méthode explicite).

`score_final = 0.15 * disponibilité + 0.15 * régularité + 0.70 * score_par_poste`

C'est une **proposition à calibrer**. Ne pas calculer les pourcentiles à partir des seuls 48 joueurs NZ : trop peu d'individus par poste. Sans groupe de référence satisfaisant, afficher les indicateurs bruts et « comparaison indisponible ».

### Seuils de confiance

- **Confiance élevée** : 900 minutes ou plus, au moins 10 matches couverts, variables principales complètes ; seuil d'analyse à calibrer.
- **À confirmer** : 300 à 899 minutes ; statistiques descriptives, pas de note automatique définitive.
- **Échantillon faible** : moins de 300 minutes ; carte « talent à suivre », sans rang de performance.
- **Données absentes** : aucune note ni substitution par zéro.

Séparer hommes et femmes tant que la couverture et la référence ne permettent pas une comparaison défendable. Ne jamais traiter un joueur absent d'Understat comme nul offensivement.

### Deux sorties différentes

**Performance actuelle** : résultats de jeu et fiabilité, à niveau de compétition comparable.

**Potentiel** : affichage distinct de l'âge, du temps de jeu précoce, de la progression sur plusieurs périodes et du contexte. L'âge seul ne justifie pas un « potentiel » chiffré ; éviter de vendre un score arbitraire comme une prédiction.

## 6. Mise en place dans notre dépôt

1. **Sorare d'abord** : sur les 48 identités confirmées, obtenir 10 à 15 derniers matches `Player.playerGameScores` avec minutes, score, détails et compétition. Faire un test en lecture seule sur 2 ou 3 joueurs avant le batch ; vérifier nulls, version du scoring, statut des matches et couverture.
2. **Historiser** : créer `public/data/sorare_performance.json` alimenté uniquement par un script Python Actions avec la clé `SORARE_API_KEY` côté serveur. Stocker `player_id`, `sorare_slug`, `source`, `retrieved_at`, `game_id`, `date`, `competition`, `position`, `minutes`, `score`, `scoring_version`, `low_coverage`, stats réelles. Jamais de secret dans `public/`.
3. **Understat** : compléter `data/understat/verified_players.csv` par ID + preuve, puis importer uniquement des exports permis. Le fichier actuel `understat_shots.json` ne contient que les tirs ; prévoir une deuxième collection pour `minutes, xA, xGChain, xGBuildup` par **joueur, saison, club, compétition**.
4. **Mesures dérivées** : un fichier `public/data/scouting_metrics.json` par joueur / saison / poste, avec métriques, unité, source, effectif, dénominateurs et niveau de confiance. L'absence reste `null`.
5. **Interface** : cartes « forme récente », « points forts », « vigilance », « carte des tirs », puis filtres par sous-poste, âge et minutes. Le classement n'arrive qu'une fois ses dénominateurs vérifiés.

### Points de vigilance techniques

- Un même joueur Understat peut avoir plusieurs lignes club pour une saison à cause d'un transfert : agréger avec son ID, sans doublonner.
- Ne pas additionner les statistiques **Sorare** et **Understat** sans périodes et définitions compatibles.
- Ne pas présenter `shotAccuracy`, `crossAccuracy` ou `passAccuracy` comme des pourcentages avant de vérifier les unités observées dans la réponse API.
- Le score Sorare est un score de fantasy ; ce n'est pas une vérité sportive universelle.
- Un changement de scoring ou de couverture invalide une comparaison directe.
- Respecter le droit d'accès et de republication des données Understat ; aucun scraping forcé ni faux événements.

**Objectif V1 raisonnable :** de vraies cartes de performance Sorare sur les identités vérifiées, avec métriques fiables par poste ; Understat ensuite pour enrichir les attaquants et les milieux créatifs.
