# Jogo FPS Multiplayer com Cloudflare Tunnel

Este é um jogo de tiro em primeira pessoa (FPS) simples feito em Node.js e Three.js, projetado para ser jogado com um amigo usando o Cloudflare Tunnel.

## Pré-requisitos

1.  [Node.js](https://nodejs.org/) instalado.
2.  [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) instalado no seu computador.

## Instalação e Execução Local

1.  Abra o terminal na pasta do projeto.
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Inicie o servidor:
    ```bash
    npm start
    ```
4.  O jogo estará rodando localmente em `http://localhost:3000`.

## Como Jogar com um Amigo (Cloudflare Tunnel)

Para que seu amigo possa entrar no jogo sem estar na mesma rede Wi-Fi, você usará o Cloudflare Tunnel para expor seu servidor local.

1.  Com o servidor rodando (passo anterior), abra **outro** terminal.
2.  Execute o seguinte comando do Cloudflare Tunnel:
    ```bash
    cloudflared tunnel --url http://localhost:3000
    ```
3.  O terminal mostrará uma URL parecida com `https://tuna-rabbit-pizza-com.trycloudflare.com`.
4.  Copie essa URL e envie para seu amigo.
5.  Ambos (você e seu amigo) devem acessar essa URL no navegador.

**Nota:** O `cloudflared` pode pedir login na primeira vez. Siga as instruções no terminal se necessário.

## Controles

*   **W, A, S, D**: Mover
*   **Mouse**: Olhar ao redor
*   **Clique**: Atirar
*   **Espaço**: Pular
*   **Clique na tela** para começar/focar.
*   **ESC** para sair do modo de tela cheia/mouse.

## Funcionalidades do Jogo

*   **Mapa Texturizado**: Uma arena com chão e paredes texturizadas.
*   **Colisão**: Jogadores e tiros colidem com as paredes.
*   **Sistema de Vidas**: Cada jogador tem uma barra de vida com indicador numérico (%).
*   **Munição e Recarga**: Limite de 7 munições. Recarga automática ao tentar atirar sem bala ou manual (R). Leva 3 segundos.
*   **Tela Inicial**: Escolha de Nickname e Cor do personagem antes de entrar.
*   **Cadência de Tiro**: Limitada a ~0.4s (tiro rápido).
*   **Dano Localizado**: Headshot é Instakill (100 dano), tiro no corpo causa 35 de dano.
*   **Recuperação de Vida**: Ao eliminar um jogador, você recupera 35 de vida.
*   **Feedback de Tiro**: Hit marker aparece na crosshair ao acertar um inimigo.
*   **Kill Feed**: Mensagens de eliminação centralizadas no topo da tela.
*   **Chat Global**: Pressione Enter para abrir o chat, digite e pressione Enter para enviar.
*   **Leaderboard**: Mostra a pontuação e nomes dos jogadores.
*   **Mapa Dust 2**: Novo mapa inspirado no clássico Dust 2 (Long A, Site, CT Spawn).
*   **Arsenal Expandido**:
    *   **AK-47**: Automática, alto dano, alto recuo, penalidade de movimento (45%).
    *   **SMG**: Automática, tiro rápido, baixo dano, penalidade leve (30%).
    *   **Revolver**: Semi-automática, alto dano (50/100), penalidade mínima (10%).
    *   **Faca**: Corpo a corpo, sem munição, velocidade máxima.
*   **Sistema de Loadout**: Spawn com arma primária aleatória (AK, SMG, ou Revolver).
*   **Mecânica de Tiro**: 
    *   **Recuo**: Tiros contínuos diminuem a precisão.
    *   **Movimento**: Andar diminui a precisão.
    *   **Agachar**: Aumenta significativamente a precisão e reduz o recuo.
*   **Correção de UI**: Seleção de cores corrigida na tela inicial.
*   **Mapa Dust 2**: Novo mapa inspirado no clássico Dust 2 (Long A, Site, CT Spawn).
*   **Física Aprimorada**: Gravidade ajustada (25 m/s²), movimento rápido (80.0) e câmera alinhada com a cabeça dos inimigos (correção de perspectiva).
*   **Mapa Arena 2.0**: Mapa expandido com áreas "Long", "Mid" e "Site", inspirado em shooters clássicos.
*   **Modelo de Personagem**: Novo modelo estilo "Minecraft/Roblox" com cabeça maior (Hitbox expandida).
*   **Sistema de Agachar**: Pressione Shift para agachar (aumenta precisão do tiro).
*   **Sistema de Precisão**: Tiro dinâmico (menos preciso em movimento, mais preciso agachado).
*   **Spawn Seguro**: Jogadores nascem em pontos predefinidos (T Spawn, CT Spawn, etc) e caem do céu para evitar bugs de colisão.
*   **Física Ajustada**: Pulo alto (14.0 vel) e velocidade lateral reduzida (strafing) para melhor controle.
*   **Respawn**: Ao morrer, você pode clicar em "Play Again" para renascer em uma posição aleatória.
