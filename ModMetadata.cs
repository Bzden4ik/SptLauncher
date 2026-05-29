using System.Collections.Generic;
using SemanticVersioning;
using SPTarkov.Server.Core.Models.Spt.Mod;

namespace SptLauncherServer
{
    public record ModMetadata : AbstractModMetadata
    {
        public override string ModGuid { get; init; } = "sptlauncherserver.local";
        public override string Name { get; init; } = "SptLauncherServer";
        public override string Author { get; init; } = "local";
        public override List<string>? Contributors { get; init; }
        public override Version Version { get; init; } = new Version("1.1.0", false);
        public override Range SptVersion { get; init; } = new Range("^4.0.0", false);
        public override List<string>? Incompatibilities { get; init; }
        public override Dictionary<string, Range>? ModDependencies { get; init; }
        public override string? Url { get; init; } = null;
        public override bool? IsBundleMod { get; init; } = false;
        public override string? License { get; init; } = "MIT";
    }
}
