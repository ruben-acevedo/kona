// Instalador e desinstalador do Kona: as janelas que a pessoa vê.
//
// Instalar (Kona-Setup-<versão>.exe): mostra a pasta de instalação (padrão C:\Program Files\Kona,
// dá para trocar) e o botão Install. Por baixo roda o instalador NSIS gerado pelo electron-builder
// (embutido como recurso "payload.exe") em modo silencioso e elevado (o Windows pede permissão de
// administrador ao clicar em Install). O NSIS cuida do que importa no Windows: arquivos, atalhos
// para todos os usuários, entrada em "Adicionar ou remover programas" e as atualizações automáticas
// (que usam o NSIS direto, sem esta janela). Esta janela continua sem elevação, para o "Open Kona"
// abrir o navegador como usuário comum.
//
// Desinstalar ("Kona Uninstaller.exe", compilado com /define:UNINSTALL e instalado junto com o app):
// o Windows o chama pelo "Desinstalar" das Configurações. Ele pergunta e, ao confirmar, roda uma
// cópia elevada de si mesmo (--remove) que chama o desinstalador NSIS em silêncio; a janela mostra
// o progresso. Chamado com argumentos do NSIS (/S, _?=…), como acontece numa atualização, só repassa
// tudo ao desinstalador NSIS, sem janela.
//
// Todo o texto que aparece na tela está em inglês.
//
// Compilado pelo scripts/dist.js com o csc.exe do .NET Framework 4.8 (já vem no Windows 10/11):
// por isso é C# 5 (sem interpolação de strings nem operador ?.).
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using IOPath = System.IO.Path;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        // Só para desenvolvimento: "--preview" simula (não instala nem remove nada) e
        // "--snapshot=<arquivo.png>,<ms>" salva a janela como imagem depois de <ms> e fecha.
        bool preview = false; string snap = null; int snapMs = 0;
        foreach (string a in args)
        {
            if (a == "--preview") preview = true;
            if (a.StartsWith("--snapshot="))
            {
                string[] parts = a.Substring(11).Split(',');
                snap = parts[0]; snapMs = parts.Length > 1 ? int.Parse(parts[1]) : 1500;
            }
        }
#if UNINSTALL
        // Parte elevada da remoção: "--remove <pasta>" (chamada pela janela, com permissão de administrador)
        if (args.Length >= 2 && args[0] == "--remove") return Engine.RemoveElevated(args[1]);
        string instDir = IOPath.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        // Atualizações e desinstalação silenciosa: repassa ao desinstalador NSIS
        foreach (string a in args) if (a == "/S" || a.StartsWith("_?=")) return Engine.ProxyUninstall(args);
        // Roda de uma cópia temporária: a pasta do Kona (onde este arquivo está) vai ser apagada
        int i = Array.IndexOf(args, "--from-temp");
        if (i >= 0 && i + 1 < args.Length) instDir = args[i + 1];
        else if (!preview) return Engine.RelaunchFromTemp(instDir, args);
        var mode = Mode.Uninstall;
#else
        // "/S": instalação silenciosa, sem janela (para scripts e implantação em empresas)
        if (Array.IndexOf(args, "/S") >= 0) return Engine.InstallSilently();
        string instDir = Engine.DefaultInstallDir;
        var mode = Mode.Install;
#endif
        var app = new Application();
        app.ShutdownMode = ShutdownMode.OnMainWindowClose;
        return app.Run(new KonaWindow(mode, instDir, preview, snap, snapMs));
    }
}

enum Mode { Install, Uninstall }

static class Engine
{
    public const string UninstallerName = "Uninstall Kona.exe";
    public const int ErrorCancelled = 1223; // a pessoa recusou o pedido de administrador do Windows

    /// <summary>C:\Program Files\Kona (a pasta de 64 bits, mesmo que este processo rode em 32).</summary>
    public static string DefaultInstallDir
    {
        get
        {
            string pf = Environment.GetEnvironmentVariable("ProgramW6432");
            if (string.IsNullOrEmpty(pf)) pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            return IOPath.Combine(pf, "Kona");
        }
    }

    public static string DataDir
    {
        get { return IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kona"); }
    }

    public static string ExtractPayload()
    {
        string tmp = IOPath.Combine(IOPath.GetTempPath(), "kona-setup-" + Guid.NewGuid().ToString("N") + ".exe");
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.exe"))
        using (FileStream f = File.Create(tmp)) s.CopyTo(f);
        return tmp;
    }

    public static Process Run(string exe, string args)
    {
        return Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, CreateNoWindow = true });
    }

    /// <summary>
    /// Roda como administrador (o Windows mostra o pedido de permissão; se o processo já é elevado,
    /// não pergunta). Devolve null se a pessoa recusar.
    /// </summary>
    public static Process RunElevated(string exe, string args)
    {
        try
        {
            return Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden });
        }
        catch (System.ComponentModel.Win32Exception e)
        {
            if (e.NativeErrorCode == ErrorCancelled) return null;
            throw;
        }
    }

    /// <summary>Argumentos do NSIS: /D= define a pasta e precisa vir por último, sem aspas.</summary>
    public static string InstallArgs(string dir) { return "/S /D=" + dir.TrimEnd('\\'); }

    public static int InstallSilently()
    {
        string payload = ExtractPayload();
        try
        {
            Process p = RunElevated(payload, InstallArgs(DefaultInstallDir));
            if (p == null) return ErrorCancelled;
            p.WaitForExit();
            return p.ExitCode;
        }
        finally { TryDelete(payload); }
    }

    /// <summary>
    /// Parte elevada da desinstalação: roda o desinstalador NSIS no lugar ("_?=", para poder esperar
    /// por ele) e apaga o que sobra da pasta. Os dados pessoais (/KEEP_APP_DATA) ficam a cargo da
    /// janela, que roda como o usuário.
    /// </summary>
    public static int RemoveElevated(string dir)
    {
        dir = dir.TrimEnd('\\');
        string nsis = IOPath.Combine(dir, UninstallerName);
        int code = 0;
        if (File.Exists(nsis))
        {
            Process p = Run(nsis, "/S /allusers /KEEP_APP_DATA _?=" + dir);
            p.WaitForExit();
            code = p.ExitCode;
        }
        if (code == 0) TryDeleteDir(dir); // o que o "_?=" deixa para trás (o próprio desinstalador)
        return code;
    }

    /// <summary>Repassa a linha de comando, como veio, ao desinstalador NSIS da pasta do Kona.</summary>
    public static int ProxyUninstall(string[] args)
    {
        string dir = IOPath.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        foreach (string a in args) if (a.StartsWith("_?=")) dir = a.Substring(3);
        string nsis = IOPath.Combine(dir, UninstallerName);
        if (!File.Exists(nsis)) return 1;
        Process p = Run(nsis, RawArguments());
        p.WaitForExit();
        return p.ExitCode;
    }

    /// <summary>Argumentos exatamente como chegaram (o "_?=" do NSIS não pode ganhar aspas).</summary>
    static string RawArguments()
    {
        string cmd = Environment.CommandLine.TrimStart();
        int end = cmd.StartsWith("\"") ? cmd.IndexOf('"', 1) + 1 : cmd.IndexOf(' ');
        return end <= 0 || end >= cmd.Length ? "" : cmd.Substring(end).TrimStart();
    }

    public static int RelaunchFromTemp(string instDir, string[] args)
    {
        string self = Assembly.GetExecutingAssembly().Location;
        string tmp = IOPath.Combine(IOPath.GetTempPath(), "kona-uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
        File.Copy(self, tmp);
        Process.Start(new ProcessStartInfo(tmp, "--from-temp \"" + instDir.TrimEnd('\\') + "\"") { UseShellExecute = false });
        return 0;
    }

    /// <summary>Apaga este .exe temporário depois que ele fechar.</summary>
    public static void DeleteSelfLater()
    {
        string self = Assembly.GetExecutingAssembly().Location;
        if (!self.StartsWith(IOPath.GetTempPath(), StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 > nul & del /f /q \"" + self + "\"")
            { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
        }
        catch { }
    }

    /// <summary>O Kona instalado está aberto? (a instalação e a remoção precisam dele fechado)</summary>
    public static bool KonaRunning(string instDir)
    {
        foreach (Process p in Process.GetProcessesByName("Kona"))
        {
            try
            {
                string f = p.MainModule.FileName;
                if (f.StartsWith(instDir, StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch { return true; }
        }
        return false;
    }

    public static long DirSize(string dir)
    {
        long total = 0;
        try
        {
            if (!Directory.Exists(dir)) return 0;
            foreach (string f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
            {
                try { total += new FileInfo(f).Length; } catch { }
            }
        }
        catch { }
        return total;
    }

    public static void TryDelete(string file)
    {
        for (int i = 0; i < 10; i++)
        {
            try { if (File.Exists(file)) File.Delete(file); return; } catch { Thread.Sleep(300); }
        }
    }

    public static void TryDeleteDir(string dir)
    {
        for (int i = 0; i < 10; i++)
        {
            try { if (Directory.Exists(dir)) Directory.Delete(dir, true); return; } catch { Thread.Sleep(300); }
        }
    }
}

class KonaWindow : Window
{
    // Paleta do Kona (a mesma do fundo Aurora e da interface)
    static readonly Color Ink = Color.FromRgb(0xF4, 0xF5, 0xFB);
    static readonly Color Muted = Color.FromRgb(0xA4, 0xA9, 0xC6);
    static readonly Color Blue = Color.FromRgb(0x3B, 0x82, 0xFF);
    static readonly Color Violet = Color.FromRgb(0x8B, 0x5C, 0xF6);
    static readonly Color Orange = Color.FromRgb(0xFF, 0x8A, 0x4C);
    static readonly Color Coral = Color.FromRgb(0xFF, 0x9A, 0x8A);
    static readonly FontFamily Display = new FontFamily("Segoe UI Variable Display, Segoe UI");
    static readonly FontFamily Text = new FontFamily("Segoe UI Variable Text, Segoe UI");
    const double CardW = 480;

    readonly Mode mode;
    string instDir;
    readonly bool preview;
    readonly double cardH;

    readonly Border card;
    readonly Image logo;
    readonly StackPanel heading;
    readonly TextBlock subtitle;
    readonly Grid footer;
    readonly TextBlock status;
    readonly TextBlock percent;
    readonly Border fillRect;
    readonly Border track;
    readonly StackPanel buttons;
    readonly Border primary;
    readonly TextBlock primaryText;
    readonly Border secondary;
    readonly StackPanel confirm;
    readonly StackPanel location;
    readonly TextBlock locationPath;
    readonly Border toggle;
    readonly Border close;

    double shown;      // progresso desenhado (suavizado)
    double target;     // progresso medido
    bool working;
    bool done;
    bool failed;
    bool deleteData;
    DateTime started;
    DispatcherTimer ticker;

    public KonaWindow(Mode mode, string instDir, bool preview, string snapshot, int snapshotMs)
    {
        this.mode = mode;
        this.instDir = instDir;
        this.preview = preview;
        cardH = mode == Mode.Install ? 420 : 372;

        Title = mode == Mode.Install ? "Install Kona" : "Uninstall Kona";
        Width = CardW + 60; Height = cardH + 60;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        UseLayoutRounding = true;
        TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
        try { Icon = BitmapFrame.Create(Res("icon.png")); } catch { }

        if (snapshot != null)
        {
            var st = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(snapshotMs) };
            st.Tick += delegate { st.Stop(); SaveSnapshot(snapshot); working = false; Close(); };
            Loaded += delegate { st.Start(); };
        }

        // Cartão: fundo noite com as "luzes" do Aurora, borda fina e sombra macia
        card = new Border
        {
            Margin = new Thickness(30),
            CornerRadius = new CornerRadius(24),
            Background = new LinearGradientBrush(Color.FromRgb(0x15, 0x18, 0x2C), Color.FromRgb(0x20, 0x18, 0x38), 45),
            Effect = new DropShadowEffect { BlurRadius = 34, ShadowDepth = 10, Direction = 270, Opacity = 0.45, Color = Colors.Black },
            Opacity = 0,
            RenderTransformOrigin = new Point(0.5, 0.5),
            RenderTransform = new ScaleTransform(0.96, 0.96),
        };
        card.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); };

        var layers = new Grid { ClipToBounds = true };
        layers.Clip = new RectangleGeometry(new Rect(0, 0, CardW, cardH), 24, 24);
        layers.Children.Add(Glow(Blue, 0.42, -120, -150, 380));
        layers.Children.Add(Glow(Violet, 0.22, 180, -60, 300));
        layers.Children.Add(Glow(Orange, mode == Mode.Install ? 0.26 : 0.18, 230, cardH - 170, 360));
        layers.Children.Add(new Border
        {
            CornerRadius = new CornerRadius(24),
            BorderThickness = new Thickness(1),
            BorderBrush = new SolidColorBrush(Color.FromArgb(0x24, 0xFF, 0xFF, 0xFF)),
        });

        // Centro: abacaxi, nome e subtítulo
        var center = new StackPanel { VerticalAlignment = VerticalAlignment.Top, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 46, 0, 0) };
        logo = new Image
        {
            Width = 96, Height = 96,
            Source = LoadBitmap("icon.png"),
            Effect = new DropShadowEffect { BlurRadius = 26, ShadowDepth = 8, Direction = 270, Opacity = 0.5, Color = Color.FromRgb(0x05, 0x06, 0x12) },
            Opacity = 0,
            RenderTransform = new TranslateTransform(0, 12),
        };
        RenderOptions.SetBitmapScalingMode(logo, BitmapScalingMode.HighQuality);
        center.Children.Add(logo);
        heading = new StackPanel { Opacity = 0, RenderTransform = new TranslateTransform(0, 8) };
        heading.Children.Add(new TextBlock
        {
            Text = "Kona", FontFamily = Display, FontSize = 34, FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Ink), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 14, 0, 0),
        });
        subtitle = new TextBlock
        {
            Text = mode == Mode.Install ? "smart design, high performance" : "Remove Kona from this computer?",
            FontFamily = Text, FontSize = 13.5, Foreground = new SolidColorBrush(Muted),
            HorizontalAlignment = HorizontalAlignment.Center, TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 2, 0, 0),
        };
        heading.Children.Add(subtitle);
        center.Children.Add(heading);
        layers.Children.Add(center);

        // Rodapé: estado + porcentagem e barra fina com brilho; ou a confirmação; e os botões
        footer = new Grid { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(44, 0, 44, 36), Opacity = 0 };
        footer.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        footer.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var labels = new Grid { Margin = new Thickness(0, 0, 0, 10) };
        status = new TextBlock { Text = "", FontFamily = Text, FontSize = 12.5, Foreground = new SolidColorBrush(Muted), TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center };
        percent = new TextBlock { Text = "", FontFamily = Text, FontSize = 12.5, Foreground = new SolidColorBrush(Muted), HorizontalAlignment = HorizontalAlignment.Right };
        Typography.SetNumeralAlignment(percent, FontNumeralAlignment.Tabular);
        labels.Children.Add(status);
        labels.Children.Add(percent);
        footer.Children.Add(labels);

        track = new Border { Height = 5, CornerRadius = new CornerRadius(3), Background = new SolidColorBrush(Color.FromArgb(0x22, 0xFF, 0xFF, 0xFF)), ClipToBounds = true, Visibility = Visibility.Collapsed };
        Grid.SetRow(track, 1);
        var gradient = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(CardW - 88, 0), MappingMode = BrushMappingMode.Absolute };
        gradient.GradientStops.Add(new GradientStop(Blue, 0));
        gradient.GradientStops.Add(new GradientStop(Violet, 0.55));
        gradient.GradientStops.Add(new GradientStop(Orange, 1));
        // a parte preenchida cresce em largura; o brilho corre dentro dela (e some fora dela)
        fillRect = new Border { CornerRadius = new CornerRadius(3), Background = gradient, HorizontalAlignment = HorizontalAlignment.Left, Width = 0, ClipToBounds = true };
        var shine = new Rectangle
        {
            Width = 90, HorizontalAlignment = HorizontalAlignment.Left,
            Fill = new LinearGradientBrush(new GradientStopCollection
            {
                new GradientStop(Color.FromArgb(0, 255, 255, 255), 0),
                new GradientStop(Color.FromArgb(0x66, 255, 255, 255), 0.5),
                new GradientStop(Color.FromArgb(0, 255, 255, 255), 1),
            }, 0),
            RenderTransform = new TranslateTransform(-90, 0),
        };
        var inner = new Grid { Width = CardW - 88, HorizontalAlignment = HorizontalAlignment.Left };
        inner.Children.Add(shine);
        fillRect.Child = inner;
        track.Child = fillRect;
        footer.Children.Add(track);
        var sweep = new DoubleAnimation(-90, CardW - 88, TimeSpan.FromSeconds(1.6)) { RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut } };
        ((TranslateTransform)shine.RenderTransform).BeginAnimation(TranslateTransform.XProperty, sweep);

        // Confirmação da desinstalação: opção de apagar os dados
        confirm = new StackPanel { Visibility = Visibility.Collapsed, Margin = new Thickness(0, 0, 0, 18) };
        var row = new Grid { Cursor = Cursors.Hand, Background = Brushes.Transparent };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var texts = new StackPanel();
        texts.Children.Add(new TextBlock { Text = "Also delete my data", FontFamily = Text, FontSize = 13.5, Foreground = new SolidColorBrush(Ink) });
        texts.Children.Add(new TextBlock { Text = "Favorites, history, profiles and sign-ins saved on this computer.", FontFamily = Text, FontSize = 12, Foreground = new SolidColorBrush(Muted), Margin = new Thickness(0, 2, 0, 0) });
        row.Children.Add(texts);
        var knob = new Ellipse { Width = 16, Height = 16, Fill = Brushes.White, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(2, 0, 0, 0), RenderTransform = new TranslateTransform(0, 0) };
        toggle = new Border { Width = 38, Height = 22, CornerRadius = new CornerRadius(11), Background = new SolidColorBrush(Color.FromArgb(0x33, 0xFF, 0xFF, 0xFF)), VerticalAlignment = VerticalAlignment.Center, Child = knob };
        Grid.SetColumn(toggle, 1);
        row.Children.Add(toggle);
        OnClick(row, delegate
        {
            deleteData = !deleteData;
            AnimateTransform((TranslateTransform)knob.RenderTransform, TranslateTransform.XProperty, deleteData ? 16 : 0, 220, 0);
            toggle.Background = new SolidColorBrush(deleteData ? Coral : Color.FromArgb(0x33, 0xFF, 0xFF, 0xFF));
        });
        confirm.Children.Add(row);
        Grid.SetRow(confirm, 0);
        footer.Children.Add(confirm);

        // Antes de instalar: a pasta de instalação (clicar abre o seletor de pastas do Windows)
        location = new StackPanel { Visibility = Visibility.Collapsed, Margin = new Thickness(0, 0, 0, 18) };
        var locHead = new Grid { Margin = new Thickness(2, 0, 2, 7) };
        locHead.Children.Add(new TextBlock { Text = "Install location", FontFamily = Text, FontSize = 12, Foreground = new SolidColorBrush(Muted) });
        if (BuildInfo.EstimatedBytes > 0)
            locHead.Children.Add(new TextBlock
            {
                Text = Math.Round(BuildInfo.EstimatedBytes / 1048576.0) + " MB", FontFamily = Text, FontSize = 12,
                Foreground = new SolidColorBrush(Muted), HorizontalAlignment = HorizontalAlignment.Right,
            });
        location.Children.Add(locHead);
        Brush boxRest = new SolidColorBrush(Color.FromArgb(0x16, 0xFF, 0xFF, 0xFF));
        Brush boxHover = new SolidColorBrush(Color.FromArgb(0x24, 0xFF, 0xFF, 0xFF));
        var box = new Border
        {
            Height = 42, CornerRadius = new CornerRadius(12), Padding = new Thickness(14, 0, 6, 0), Cursor = Cursors.Hand,
            Background = boxRest, BorderThickness = new Thickness(1), BorderBrush = new SolidColorBrush(Color.FromArgb(0x1C, 0xFF, 0xFF, 0xFF)),
        };
        var boxGrid = new Grid();
        boxGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        boxGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        boxGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var folderIcon = new System.Windows.Shapes.Path
        {
            Data = Geometry.Parse("M0.5,2.5 A1.5,1.5 0 0 1 2,1 L5.2,1 L6.7,2.6 L12,2.6 A1.5,1.5 0 0 1 13.5,4.1 L13.5,10 A1.5,1.5 0 0 1 12,11.5 L2,11.5 A1.5,1.5 0 0 1 0.5,10 Z"),
            Stroke = new SolidColorBrush(Muted), StrokeThickness = 1.3, StrokeLineJoin = PenLineJoin.Round,
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 10, 0),
        };
        boxGrid.Children.Add(folderIcon);
        locationPath = new TextBlock
        {
            FontFamily = Text, FontSize = 13, Foreground = new SolidColorBrush(Ink), VerticalAlignment = VerticalAlignment.Center,
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        Grid.SetColumn(locationPath, 1);
        boxGrid.Children.Add(locationPath);
        var change = new Border
        {
            CornerRadius = new CornerRadius(8), Padding = new Thickness(12, 6, 12, 6), Margin = new Thickness(8, 0, 0, 0),
            Background = new SolidColorBrush(Color.FromArgb(0x1C, 0xFF, 0xFF, 0xFF)), VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock { Text = "Change…", FontFamily = Text, FontSize = 12.5, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(Ink) },
        };
        Grid.SetColumn(change, 2);
        boxGrid.Children.Add(change);
        box.Child = boxGrid;
        box.MouseEnter += delegate { box.Background = boxHover; };
        box.MouseLeave += delegate { box.Background = boxRest; };
        OnClick(box, ChooseFolder);
        location.Children.Add(box);
        Grid.SetRow(location, 0);
        footer.Children.Add(location);
        ShowLocation();

        // Botões (pílulas): principal claro e, antes de começar, "Cancel" discreto ao lado
        buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Visibility = Visibility.Collapsed, Opacity = 0, RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new ScaleTransform(0.94, 0.94) };
        Grid.SetRow(buttons, 1);
        secondary = Pill("Cancel", false);
        secondary.Margin = new Thickness(0, 0, 10, 0);
        OnClick(secondary, delegate { if (!working) FadeOutAndClose(); });
        primaryText = new TextBlock();
        primary = Pill("", true);
        primaryText = (TextBlock)primary.Child;
        OnClick(primary, OnPrimary);
        buttons.Children.Add(secondary);
        buttons.Children.Add(primary);
        footer.Children.Add(buttons);
        layers.Children.Add(footer);

        // Fechar (não durante a instalação/remoção)
        close = new Border
        {
            Width = 30, Height = 30, CornerRadius = new CornerRadius(15), Margin = new Thickness(0, 14, 14, 0),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top,
            Background = Brushes.Transparent, Cursor = Cursors.Hand, ToolTip = "Close",
            Child = new System.Windows.Shapes.Path
            {
                Data = Geometry.Parse("M0,0 L9,9 M9,0 L0,9"), Stroke = new SolidColorBrush(Muted), StrokeThickness = 1.6,
                StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round,
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            },
        };
        close.MouseEnter += delegate { close.Background = new SolidColorBrush(Color.FromArgb(0x1E, 0xFF, 0xFF, 0xFF)); };
        close.MouseLeave += delegate { close.Background = Brushes.Transparent; };
        OnClick(close, delegate { if (!working) FadeOutAndClose(); });
        layers.Children.Add(close);

        card.Child = layers;
        Content = card;
        Loaded += delegate { Intro(); };
        Closing += delegate(object s, System.ComponentModel.CancelEventArgs e) { if (working) e.Cancel = true; };
        Closed += delegate { if (mode == Mode.Uninstall && !preview) Engine.DeleteSelfLater(); };
        KeyDown += delegate(object s, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && buttons.Visibility == Visibility.Visible) OnPrimary();
            if (e.Key == Key.Escape && !working) FadeOutAndClose();
        };
    }

    /// <summary>
    /// Clique de verdade num elemento: pressionar e soltar em cima dele. Marca o evento como tratado
    /// para o cartão não iniciar o arrasto da janela (o DragMove engoliria o "soltar" do clique).
    /// </summary>
    static void OnClick(UIElement el, Action fn)
    {
        el.MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { e.Handled = true; el.CaptureMouse(); el.Opacity = 0.85; };
        el.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e)
        {
            e.Handled = true;
            el.Opacity = 1;
            if (!el.IsMouseCaptured) return;
            el.ReleaseMouseCapture();
            if (el.IsMouseOver) fn();
        };
        el.LostMouseCapture += delegate { el.Opacity = 1; };
    }

    Border Pill(string text, bool main)
    {
        var label = new TextBlock
        {
            Text = text, FontFamily = Text, FontSize = 14, FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(main ? Color.FromRgb(0x14, 0x16, 0x24) : Ink),
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        };
        Brush rest = main ? (Brush)new SolidColorBrush(Ink) : new SolidColorBrush(Color.FromArgb(0x1C, 0xFF, 0xFF, 0xFF));
        Brush hover = main ? (Brush)Brushes.White : new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF));
        var b = new Border
        {
            Height = 40, MinWidth = main ? 168 : 120, CornerRadius = new CornerRadius(20), Padding = new Thickness(22, 0, 22, 0),
            Background = rest, Cursor = Cursors.Hand, Child = label,
        };
        if (main) b.Effect = new DropShadowEffect { BlurRadius = 18, ShadowDepth = 4, Direction = 270, Opacity = 0.35, Color = Colors.Black };
        b.MouseEnter += delegate { b.Background = hover; };
        b.MouseLeave += delegate { b.Background = rest; };
        return b;
    }

    static UIElement Glow(Color c, double alpha, double x, double y, double size)
    {
        var brush = new RadialGradientBrush();
        brush.GradientStops.Add(new GradientStop(Color.FromArgb((byte)(alpha * 255), c.R, c.G, c.B), 0));
        brush.GradientStops.Add(new GradientStop(Color.FromArgb(0, c.R, c.G, c.B), 1));
        return new Ellipse
        {
            Width = size, Height = size, Fill = brush, IsHitTestVisible = false,
            HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(x, y, 0, 0),
        };
    }

    static Stream Res(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }

    static BitmapImage LoadBitmap(string name)
    {
        var b = new BitmapImage();
        b.BeginInit();
        b.StreamSource = Res(name);
        b.CacheOption = BitmapCacheOption.OnLoad;
        b.EndInit();
        b.Freeze();
        return b;
    }

    static void Animate(UIElement el, DependencyProperty p, double to, int ms, int delay)
    {
        var a = new DoubleAnimation(to, TimeSpan.FromMilliseconds(ms)) { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
        el.BeginAnimation(p, a);
    }

    static void AnimateTransform(Animatable t, DependencyProperty p, double to, int ms, int delay)
    {
        var a = new DoubleAnimation(to, TimeSpan.FromMilliseconds(ms)) { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
        t.BeginAnimation(p, a);
    }

    static void After(int ms, Action fn)
    {
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(ms) };
        t.Tick += delegate { t.Stop(); fn(); };
        t.Start();
    }

    void Intro()
    {
        // entrada: o cartão cresce de leve, depois o abacaxi sobe, o nome e o rodapé aparecem
        Animate(card, OpacityProperty, 1, 320, 0);
        var s = (ScaleTransform)card.RenderTransform;
        AnimateTransform(s, ScaleTransform.ScaleXProperty, 1, 420, 0);
        AnimateTransform(s, ScaleTransform.ScaleYProperty, 1, 420, 0);
        Animate(logo, OpacityProperty, 1, 420, 140);
        AnimateTransform((TranslateTransform)logo.RenderTransform, TranslateTransform.YProperty, 0, 560, 140);
        Animate(heading, OpacityProperty, 1, 420, 260);
        AnimateTransform((TranslateTransform)heading.RenderTransform, TranslateTransform.YProperty, 0, 520, 260);
        Animate(footer, OpacityProperty, 1, 380, 420);

        ShowConfirm();
    }

    /// <summary>A tela inicial: a pasta (instalar) ou a opção de apagar os dados (desinstalar) e os botões.</summary>
    void ShowConfirm()
    {
        (mode == Mode.Install ? location : confirm).Visibility = Visibility.Visible;
        secondary.Visibility = Visibility.Visible;
        primaryText.Text = mode == Mode.Install ? "Install" : "Uninstall";
        ShowButtons(false);
    }

    void ShowLocation()
    {
        locationPath.Text = instDir;
        locationPath.ToolTip = instDir;
    }

    /// <summary>Seletor de pastas do Windows. Se a pasta escolhida não for "Kona", instala numa "Kona" dentro dela.</summary>
    void ChooseFolder()
    {
        if (working) return;
        string start = Directory.Exists(instDir) ? instDir : IOPath.GetDirectoryName(instDir);
        string picked = FolderPicker.Pick(new WindowInteropHelper(this).Handle, "Choose where to install Kona", start);
        if (picked == null) return;
        picked = picked.TrimEnd('\\');
        if (picked.Length <= 2) picked += "\\"; // raiz de um disco: "D:" vira "D:\"
        string dir = string.Equals(IOPath.GetFileName(picked), "Kona", StringComparison.OrdinalIgnoreCase) ? picked : IOPath.Combine(picked, "Kona");
        instDir = dir;
        ShowLocation();
    }

    void StartWork()
    {
        if (!preview && Engine.KonaRunning(instDir))
        {
            Fail(mode == Mode.Install ? "Close Kona to continue installing." : "Close Kona to continue.");
            return;
        }
        working = true;
        done = false;
        failed = false;
        target = 0.02;
        shown = 0;
        started = DateTime.Now;
        confirm.Visibility = Visibility.Collapsed;
        location.Visibility = Visibility.Collapsed;
        status.Text = mode == Mode.Install ? "Installing Kona…" : "Removing Kona…";
        if (mode == Mode.Uninstall) subtitle.Text = "This only takes a few seconds.";
        status.Foreground = new SolidColorBrush(Muted);
        status.HorizontalAlignment = HorizontalAlignment.Left;
        status.TextAlignment = TextAlignment.Left;
        buttons.Visibility = Visibility.Collapsed;
        track.Visibility = Visibility.Visible;
        track.Opacity = 1;

        ticker = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
        ticker.Tick += delegate { Tick(); };
        ticker.Start();

        ThreadStart job = preview ? (ThreadStart)Simulate : (mode == Mode.Install ? (ThreadStart)Install : Uninstall);
        new Thread(job) { IsBackground = true }.Start();
    }

    void Progress(double v)
    {
        Dispatcher.BeginInvoke(new Action(delegate { target = Math.Max(target, Math.Min(v, 0.95)); }));
    }

    void Install()
    {
        string payload = null;
        int code = -1;
        try
        {
            payload = Engine.ExtractPayload();
            Progress(0.08);
            Process p = Engine.RunElevated(payload, Engine.InstallArgs(instDir));
            if (p == null) throw new OperationCanceledException();
            long expected = BuildInfo.EstimatedBytes;
            while (!p.WaitForExit(250))
            {
                // progresso real: quanto do app já foi copiado para a pasta de instalação
                double bySize = Math.Min(1.0, Engine.DirSize(instDir) / (double)expected);
                double byTime = 1 - Math.Exp(-(DateTime.Now - started).TotalSeconds / 9.0);
                Progress(0.08 + 0.87 * Math.Max(bySize, byTime * 0.9));
            }
            code = p.ExitCode;
        }
        catch (OperationCanceledException) { code = Engine.ErrorCancelled; }
        catch (Exception) { code = -2; }
        finally { if (payload != null) Engine.TryDelete(payload); }
        int result = code;
        Dispatcher.BeginInvoke(new Action(delegate { Finished(result); }));
    }

    void Uninstall()
    {
        int code = -1;
        try
        {
            long initial = Math.Max(1, Engine.DirSize(instDir));
            // a remoção da pasta (em Program Files) roda numa cópia elevada deste .exe (--remove);
            // os dados pessoais só saem se a pessoa marcou a opção (feito aqui, como o usuário)
            string self = Assembly.GetExecutingAssembly().Location;
            Process p = Engine.RunElevated(self, "--remove \"" + instDir.TrimEnd('\\') + "\"");
            if (p == null) throw new OperationCanceledException();
            while (!p.WaitForExit(200))
            {
                double removed = 1 - Engine.DirSize(instDir) / (double)initial;
                double byTime = 1 - Math.Exp(-(DateTime.Now - started).TotalSeconds / 4.0);
                Progress(0.05 + 0.85 * Math.Max(removed, byTime * 0.9));
            }
            code = p.ExitCode;
            if (code == 0)
            {
                Engine.TryDeleteDir(IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "kona-updater"));
                if (deleteData) Engine.TryDeleteDir(Engine.DataDir);
            }
        }
        catch (OperationCanceledException) { code = Engine.ErrorCancelled; }
        catch (Exception) { code = -2; }
        int result = code;
        Dispatcher.BeginInvoke(new Action(delegate { Finished(result); }));
    }

    void Simulate()
    {
        for (int i = 1; i <= 50; i++)
        {
            Thread.Sleep(100);
            Progress(i / 50.0);
        }
        Dispatcher.BeginInvoke(new Action(delegate { Finished(0); }));
    }

    void Tick()
    {
        shown += (target - shown) * 0.08;
        if (Math.Abs(target - shown) < 0.001) shown = target;
        fillRect.Width = Math.Max(0, track.ActualWidth * shown);
        percent.Text = working || done ? Math.Round(shown * 100) + "%" : "";
        if (done && shown >= 0.999) { ticker.Stop(); Ready(); }
    }

    void Finished(int code)
    {
        working = false;
        if (code == 0) { done = true; target = 1; return; }
        ticker.Stop();
        if (code == Engine.ErrorCancelled)
            Fail(mode == Mode.Install
                ? "Kona needs administrator permission to install here."
                : "Kona needs administrator permission to be removed.");
        else
            Fail(mode == Mode.Install
                ? "Kona couldn’t be installed (error " + code + ")."
                : "Kona couldn’t be removed (error " + code + ").");
    }

    void Fail(string message)
    {
        failed = true;
        status.Text = message;
        status.Foreground = new SolidColorBrush(Coral);
        percent.Text = "";
        primaryText.Text = "Try again";
        ShowButtons(true);
    }

    void Ready()
    {
        if (mode == Mode.Install)
        {
            // instalado: só o botão (ele já diz que terminou); abre sozinho em instantes
            status.Text = "";
            primaryText.Text = "Open Kona";
            ShowButtons(true);
            After(2400, delegate { if (IsVisible) OnPrimary(); });
        }
        else
        {
            subtitle.Text = "Kona has been removed. Thanks for browsing with it.";
            status.Text = "";
            primaryText.Text = "Close";
            ShowButtons(true);
        }
    }

    void ShowButtons(bool fromBar)
    {
        // a mensagem fica centralizada, acima do botão
        status.HorizontalAlignment = HorizontalAlignment.Center;
        status.TextAlignment = TextAlignment.Center;
        percent.Text = "";
        secondary.Visibility = !done && !failed ? Visibility.Visible : Visibility.Collapsed;
        Action show = delegate
        {
            track.Visibility = Visibility.Collapsed;
            buttons.Visibility = Visibility.Visible;
            buttons.Opacity = 0;
            var s = (ScaleTransform)buttons.RenderTransform;
            s.ScaleX = s.ScaleY = 0.94;
            Animate(buttons, OpacityProperty, 1, 260, 0);
            AnimateTransform(s, ScaleTransform.ScaleXProperty, 1, 360, 0);
            AnimateTransform(s, ScaleTransform.ScaleYProperty, 1, 360, 0);
        };
        if (fromBar && track.Visibility == Visibility.Visible) { Animate(track, OpacityProperty, 0, 200, 0); After(200, show); }
        else show();
    }

    void OnPrimary()
    {
        if (working) return;
        if (!done) { StartWork(); return; }
        if (mode == Mode.Install && !preview)
        {
            try { Process.Start(new ProcessStartInfo(IOPath.Combine(instDir, "Kona.exe")) { UseShellExecute = true }); }
            catch { }
        }
        FadeOutAndClose();
    }

    void SaveSnapshot(string file)
    {
        var dpi = VisualTreeHelper.GetDpi(this);
        var bmp = new RenderTargetBitmap((int)(ActualWidth * dpi.DpiScaleX), (int)(ActualHeight * dpi.DpiScaleY), dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        bmp.Render(this);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using (var f = File.Create(file)) enc.Save(f);
    }

    void FadeOutAndClose()
    {
        var a = new DoubleAnimation(0, TimeSpan.FromMilliseconds(220)) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseIn } };
        a.Completed += delegate { Close(); };
        card.BeginAnimation(OpacityProperty, a);
        var s = (ScaleTransform)card.RenderTransform;
        AnimateTransform(s, ScaleTransform.ScaleXProperty, 0.97, 220, 0);
        AnimateTransform(s, ScaleTransform.ScaleYProperty, 0.97, 220, 0);
    }
}

/// <summary>
/// O seletor de pastas moderno do Windows (IFileOpenDialog com FOS_PICKFOLDERS), o mesmo do Explorador.
/// O FolderBrowserDialog do WinForms mostra a árvore antiga, por isso a chamada direta ao COM.
/// </summary>
static class FolderPicker
{
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    class FileOpenDialogCom { }

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr specs);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint sigdn, out IntPtr name);
        void GetAttributes(uint mask, out uint attribs);
        void Compare(IShellItem other, uint hint, out int order);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);

    const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
    const uint SIGDN_FILESYSPATH = 0x80058000;

    /// <summary>Devolve a pasta escolhida, ou null se a pessoa cancelar.</summary>
    public static string Pick(IntPtr owner, string title, string startDir)
    {
        var dlg = (IFileDialog)new FileOpenDialogCom();
        try
        {
            uint opts;
            dlg.GetOptions(out opts);
            dlg.SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
            dlg.SetTitle(title);
            dlg.SetOkButtonLabel("Select folder");
            if (!string.IsNullOrEmpty(startDir) && Directory.Exists(startDir))
            {
                try
                {
                    IShellItem start;
                    SHCreateItemFromParsingName(startDir, IntPtr.Zero, typeof(IShellItem).GUID, out start);
                    dlg.SetFolder(start);
                }
                catch { }
            }
            if (dlg.Show(owner) != 0) return null; // cancelado
            IShellItem result;
            dlg.GetResult(out result);
            IntPtr p;
            result.GetDisplayName(SIGDN_FILESYSPATH, out p);
            try { return Marshal.PtrToStringUni(p); }
            finally { Marshal.FreeCoTaskMem(p); }
        }
        finally { Marshal.ReleaseComObject(dlg); }
    }
}
